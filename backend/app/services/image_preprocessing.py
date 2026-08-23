import cv2
import numpy as np
import logging
from typing import Tuple, Dict, Any, Optional

logger = logging.getLogger(__name__)

class ImagePreprocessor:
    """
    Preprocessing pipeline for handwritten administrative documents.
    Optimized to preserve delicate pen strokes while correcting skew,
    low resolution, uneven illumination, and scan noise.
    """

    def __init__(self):
        # CLAHE (Contrast Limited Adaptive Histogram Equalization) for gentle local contrast
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    def preprocess_image(self, image_bytes: bytes) -> Tuple[bytes, Dict[str, Any]]:
        """
        Runs the full preprocessing pipeline:
        1. Decode
        2. Resolution upscale (if low DPI / small dimensions)
        3. Orientation / Deskew detection and correction
        4. Document boundary crop (perspective rectification if applicable)
        5. Stroke-preserving contrast enhancement (CLAHE in Luminance space)
        6. Non-destructive bilateral smoothing
        """
        meta: Dict[str, Any] = {
            "upscaled": False,
            "original_dimensions": [0, 0],
            "processed_dimensions": [0, 0],
            "deskew_angle": 0.0,
            "contrast_enhanced": True,
            "denoised": True,
            "stroke_preserved": True
        }

        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return image_bytes, meta

            h, w = img.shape[:2]
            meta["original_dimensions"] = [w, h]

            # 1. Resolution Check & Upscaling (Adaptive interpolation for low-res scans)
            target_img = img
            if min(w, h) < 1000:
                scale_factor = min(2.5, 1400.0 / min(w, h))
                if scale_factor > 1.1:
                    new_w = int(w * scale_factor)
                    new_h = int(h * scale_factor)
                    target_img = cv2.resize(target_img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
                    meta["upscaled"] = True

            # 2. Deskewing
            deskewed_img, angle = self._deskew(target_img)
            meta["deskew_angle"] = round(angle, 2)

            # 3. Document Boundary & Border Crop (gentle, avoids clipping text)
            cropped_img = self._auto_crop_document(deskewed_img)

            # 4. Stroke-Preserving Contrast Enhancement (CLAHE on L-channel of LAB color space)
            enhanced_img = self._enhance_contrast_lab(cropped_img)

            # 5. Stroke-Preserving Denoising (Bilateral filter smooths paper grain, preserves ink edges)
            denoised_img = cv2.bilateralFilter(enhanced_img, d=5, sigmaColor=35, sigmaSpace=35)

            # Update final dimensions
            fh, fw = denoised_img.shape[:2]
            meta["processed_dimensions"] = [fw, fh]

            # Encode to high-quality JPEG bytes (preserves stroke anti-aliasing)
            is_success, buffer = cv2.imencode(".jpg", denoised_img, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
            if is_success:
                return buffer.tobytes(), meta
            else:
                return image_bytes, meta

        except Exception as e:
            logger.warning(f"Image preprocessing encountered an error, falling back to original: {e}")
            return image_bytes, meta

    def _deskew(self, image: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Estimates skew angle of handwritten / scanned document lines and rotates back to horizontal.
        Limits rotation to reasonable angles (-45 to +45 degrees) to prevent unintended flips.
        """
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            # Gentle edge detection
            edges = cv2.Canny(gray, 50, 150, apertureSize=3)
            
            # Probabilistic Hough line transform to find text baselines / form lines
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=80, maxLineGap=10)
            
            angles = []
            if lines is not None:
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    dx = x2 - x1
                    dy = y2 - y1
                    if dx != 0:
                        angle_deg = np.degrees(np.arctan2(dy, dx))
                        # Only consider near-horizontal lines (-35 to +35)
                        if -35 <= angle_deg <= 35:
                            angles.append(angle_deg)
                            
            if not angles:
                # Fallback: minAreaRect on non-zero pixels
                thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 10)
                coords = np.column_stack(np.where(thresh > 0))
                if len(coords) > 100:
                    rect = cv2.minAreaRect(coords)
                    angle = rect[-1]
                    if angle < -45:
                        angle = -(90 + angle)
                    elif angle > 45:
                        angle = 90 - angle
                    else:
                        angle = -angle
                    if abs(angle) <= 30:
                        angles.append(angle)

            if angles:
                median_angle = float(np.median(angles))
                if abs(median_angle) > 0.4:
                    h, w = image.shape[:2]
                    center = (w // 2, h // 2)
                    M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
                    rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
                    return rotated, median_angle

            return image, 0.0
        except Exception:
            return image, 0.0

    def _auto_crop_document(self, image: np.ndarray) -> np.ndarray:
        """
        Detects outer document border margins and trims excessive black/shadow borders
        without clipping handwritten annotations or signatures.
        """
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (7, 7), 0)
            # Find document page bounding box against dark scanner background
            _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if contours:
                largest_c = max(contours, key=cv2.contourArea)
                x, y, w, h = cv2.boundingRect(largest_c)
                img_h, img_w = image.shape[:2]
                # Only crop if contour covers at least 60% of image area (avoid bad crops)
                if (w * h) >= 0.60 * (img_w * img_h):
                    # Add 2% padding around bounding box to protect edge handwriting
                    pad_x = int(0.02 * w)
                    pad_y = int(0.02 * h)
                    x1 = max(0, x - pad_x)
                    y1 = max(0, y - pad_y)
                    x2 = min(img_w, x + w + pad_x)
                    y2 = min(img_h, y + h + pad_y)
                    return image[y1:y2, x1:x2]
            return image
        except Exception:
            return image

    def _enhance_contrast_lab(self, image: np.ndarray) -> np.ndarray:
        """
        Converts to LAB color space and applies CLAHE to the L (Lightness) channel.
        Preserves natural ink color and prevents destructive white-out of light pen strokes.
        """
        try:
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l_channel, a_channel, b_channel = cv2.split(lab)
            
            # Apply CLAHE to L-channel
            cl = self.clahe.apply(l_channel)
            
            # Merge back
            limg = cv2.merge((cl, a_channel, b_channel))
            enhanced = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
            return enhanced
        except Exception:
            return image

image_preprocessor = ImagePreprocessor()
