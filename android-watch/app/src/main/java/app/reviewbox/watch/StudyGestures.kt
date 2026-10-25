package app.reviewbox.watch

/** Pure gesture policy: a swipe never determines whether an answer is correct. */
object StudyGestures {
    const val AdvanceDistanceDp = 42f
    val Ratings = setOf("wrong", "unsure", "correct")

    fun canAdvance(revealed: Boolean, rating: String?, busy: Boolean, reading: Boolean): Boolean =
        revealed && rating in Ratings && !busy && !reading

    fun shouldAdvance(distanceDp: Float, revealed: Boolean, rating: String?, busy: Boolean, reading: Boolean): Boolean =
        distanceDp <= -AdvanceDistanceDp && canAdvance(revealed, rating, busy, reading)
}
