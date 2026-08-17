import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

class OCRService:
    def __init__(self):
        # Load the pre-trained Haar Cascade classifier for face detection
        # OpenCV provides default XML files in its data path
        try:
            self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        except Exception as e:
            logger.warning(f"Could not load face cascade: {e}")
            self.face_cascade = None

    def redact_pii_from_image(self, image_bytes: bytes) -> bytes:
        """
        Detects faces in the image and applies a blur/redaction mask for GDPR compliance.
        Returns the redacted image as bytes.
        """
        if self.face_cascade is None:
            return image_bytes
            
        try:
            # Convert bytes to numpy array for OpenCV
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                # If decoding fails, return original
                return image_bytes

            # Convert to grayscale for face detection
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Detect faces
            faces = self.face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.1, 
                minNeighbors=5, 
                minSize=(30, 30)
            )
            
            # Apply redaction (blur) to detected faces
            for (x, y, w, h) in faces:
                # Extract the face region
                face_region = img[y:y+h, x:x+w]
                # Apply a strong Gaussian blur (must be odd numbers)
                blurred_face = cv2.GaussianBlur(face_region, (99, 99), 30)
                # Put the blurred region back into the image
                img[y:y+h, x:x+w] = blurred_face
                
                # Alternatively, draw a solid black rectangle for strict GDPR mask
                # cv2.rectangle(img, (x, y), (x+w, y+h), (0, 0, 0), -1)
                
            # Convert back to bytes
            is_success, buffer = cv2.imencode(".jpg", img)
            if is_success:
                return buffer.tobytes()
            else:
                return image_bytes
                
        except Exception as e:
            logger.error(f"PII redaction failed: {e}")
            # Fail gracefully, return original bytes if processing crashes
            return image_bytes

ocr_service = OCRService()
