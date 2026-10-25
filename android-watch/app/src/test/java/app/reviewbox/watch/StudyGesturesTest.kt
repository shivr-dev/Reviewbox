package app.reviewbox.watch

import org.junit.Assert.*
import org.junit.Test

class StudyGesturesTest {
    @Test fun accidentalDragsNeverSubmitLearningEvidence() {
        assertFalse(StudyGestures.shouldAdvance(-100f, false, "correct", false, false))
        assertFalse(StudyGestures.shouldAdvance(-100f, true, null, false, false))
        assertFalse(StudyGestures.shouldAdvance(-100f, true, "correct", true, false))
        assertFalse(StudyGestures.shouldAdvance(-100f, true, "correct", false, true))
        assertFalse(StudyGestures.shouldAdvance(-41f, true, "wrong", false, false))
        assertFalse(StudyGestures.shouldAdvance(90f, true, "correct", false, false))
    }
    @Test fun upwardAdvancePreservesEveryExplicitRating() {
        for (rating in StudyGestures.Ratings) assertTrue(StudyGestures.shouldAdvance(-42f, true, rating, false, false))
        assertFalse(StudyGestures.canAdvance(true, "invented", false, false))
    }
}
