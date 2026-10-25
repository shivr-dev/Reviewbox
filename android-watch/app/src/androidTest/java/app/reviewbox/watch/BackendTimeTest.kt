package app.reviewbox.watch

import org.junit.Assert.*
import org.junit.Test

class BackendTimeTest {
    @Test fun postgresMicrosecondsAndOffsetsWorkOnAndroid11() {
        val expected = 1792931912613L
        assertEquals(expected, backendTimeMillis("2026-10-25T12:38:32.613642+00:00"))
        assertEquals(expected, backendTimeMillis("2026-10-25T12:38:32.613Z"))
        assertEquals(expected, backendTimeMillis("2026-10-25T20:38:32.613642+08:00"))
        assertEquals(1792931912000L, backendTimeMillis("2026-10-25T12:38:32Z"))
    }
    @Test fun malformedExpiryIsNeverTreatedAsAValidGrant() {
        try { backendTimeMillis("not-a-time"); fail("Invalid server time must fail closed") }
        catch (_:java.time.format.DateTimeParseException) { }
    }
}
