package app.reviewbox.watch

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

/** Exercises the actual packaged native JS runtime on Android, with no WebView provider. */
class LearningCoreRuntimeTest {
    @Test fun nativeEngineKeepsGpaScoringAndTimezonesInAgreement() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val core = LearningCore(context)
        val records = JSONArray(context.assets.open("demo-records.json").bufferedReader().use { it.readText() })
        val now = Instant.parse("2026-10-25T00:10:00Z").toEpochMilli()
        suspend fun call(op: String, input: JSONObject = JSONObject()) = core.invoke(JSONObject().put("op", op).put("records", records).put("now", now).put("input", input)) as JSONObject
        try {
            val snapshot = call("snapshot")
            assertEquals(3.36, snapshot.getJSONObject("gpa").getDouble("value"), .0001)
            assertTrue(snapshot.has("weeklyGpa"))
            val id = "watch-session:runtime:timezone"
            val job = call("session-start", JSONObject().put("sessionId", id).put("deviceId", "runtime").put("subject", "math").put("type", "choice").put("limit", 1))
            records.put(JSONObject().put("id", id).put("kind", "job").put("payload", job).put("deleted", false))
            val q = job.getJSONArray("items").getJSONObject(0).getJSONObject("question")
            val event = call("answer", JSONObject().put("sessionId", id).put("deviceId", "runtime").put("eventId", "watch-event:runtime:$id:0")
                .put("questionId", q.getString("id")).put("answer", q.getString("answer"))
                .put("occurredAt", "2026-10-24T23:59:59Z").put("displayedAt", "2026-10-24T23:59:40Z").put("revealedAt", "2026-10-24T23:59:58Z")
                .put("activeThinkMs", 15000).put("wallTimeMs", 18000).put("idleMs", 3000).put("timeZone", "Pacific/Kiritimati"))
            assertEquals("2026-10-25", event.getString("localDay"))
            assertEquals(1.0, event.getDouble("score"), 0.0)
            assertFalse(event.has("mastery"))
            val title = "中文 \"');throw new Error('must remain data')\""
            val grade = call("grade", JSONObject().put("title", title).put("date", "2026-10-24")
                .put("result", JSONObject().put("score", 80).put("maxScore", 100).put("credits", 1).put("recordedAt", "2026-10-25T00:00:00Z")))
            assertEquals(title, grade.getString("title"))
        } finally { core.close() }
    }
}
