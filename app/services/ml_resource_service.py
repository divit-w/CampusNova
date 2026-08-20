from typing import List
import numpy as np
from sklearn.preprocessing import MinMaxScaler

class PredictiveAllocator:
    @staticmethod
    def rank_substitutes(candidates: List[dict]) -> List[dict]:
        if not candidates:
            return []

        if len(candidates) == 1:
            candidates[0]['suitability_score'] = 1.0
            return candidates

        substitutions = np.array([c.get('total_historical_substitutions', 0) for c in candidates]).reshape(-1, 1)
        leaves = np.array([c.get('historical_leave_probability', 0.0) for c in candidates]).reshape(-1, 1)
        compatibility = np.array([c.get('subject_compatibility_score', 0.0) for c in candidates]).reshape(-1, 1)

        scaler = MinMaxScaler()

        # Scale features
        scaled_subs = scaler.fit_transform(substitutions)
        scaled_leaves = scaler.fit_transform(leaves)
        scaled_comp = scaler.fit_transform(compatibility)

        # Invert scaled values for metrics where lower is better
        norm_subs = 1.0 - scaled_subs
        norm_leaves = 1.0 - scaled_leaves
        norm_comp = scaled_comp

        # If min == max, MinMaxScaler outputs 0. We should treat them as equal (e.g. 1.0)
        if np.max(substitutions) == np.min(substitutions):
            norm_subs = np.ones((len(candidates), 1))
        if np.max(leaves) == np.min(leaves):
            norm_leaves = np.ones((len(candidates), 1))
        if np.max(compatibility) == np.min(compatibility):
            norm_comp = np.ones((len(candidates), 1))

        # Weights: 40% compatibility, 40% low substitutions, 20% low leave probability
        w_comp, w_subs, w_leaves = 0.4, 0.4, 0.2

        for idx, candidate in enumerate(candidates):
            score = (norm_comp[idx][0] * w_comp + 
                     norm_subs[idx][0] * w_subs + 
                     norm_leaves[idx][0] * w_leaves)
            candidate['suitability_score'] = float(score)

        # Sort candidates descending
        ranked_candidates = sorted(candidates, key=lambda x: x['suitability_score'], reverse=True)
        return ranked_candidates
