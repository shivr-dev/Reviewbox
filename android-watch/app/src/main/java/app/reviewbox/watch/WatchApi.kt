package app.reviewbox.watch

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.security.MessageDigest
import java.util.UUID
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

// Android 11 Instant.parse rejects PostgreSQL's microseconds with an explicit +00:00 offset.
internal fun backendTimeMillis(value: String): Long =
    OffsetDateTime.parse(value, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toInstant().toEpochMilli()

interface WatchDeviceClient {
    suspend fun request(action:String,body:JSONObject=JSONObject(),token:String?=null):JSONObject
    suspend fun authorized(action:String,body:JSONObject=JSONObject()):JSONObject
}

class WatchApi(private val store: SecureStore) : WatchDeviceClient {
    companion object {
        fun secret(): String = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        fun sha(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
    }
    override suspend fun request(action: String, body: JSONObject, token: String?): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL(BuildConfig.DEVICE_API).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"; connection.connectTimeout = if(action=="logout")5000 else 15000; connection.readTimeout = if(action=="logout")5000 else 25000
            connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json")
            token?.let { connection.setRequestProperty("Authorization", "Device $it") }
            connection.outputStream.use { it.write(JSONObject().put("action", action).put("body", body).toString().toByteArray()) }
            val status = connection.responseCode
            val text = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}"
            val result = JSONObject(text)
            if (status !in 200..299) throw DeviceException(status, result.optString("error", "连接失败，请重试"))
            result
        } finally { connection.disconnect() }
    }
    override suspend fun authorized(action: String, body: JSONObject): JSONObject {
        var session = store.json("session") ?: error("请先配对账户")
        if (System.currentTimeMillis() >= backendTimeMillis(session.getString("accessUntil")) - 30000) {
            session = refresh(session)
        }
        return request(action, body, session.getString("access"))
    }
    private suspend fun refresh(session: JSONObject): JSONObject {
        // Persist proposed replacement tokens before rotating: retries after a lost response use the same request.
        val pending = store.json("refresh-pending") ?: JSONObject().put("requestId", UUID.randomUUID().toString())
            .put("nextAccess", secret()).put("nextRefresh", secret()).also { store.put("refresh-pending", it.toString()) }
        val result = request("refresh", JSONObject().put("refresh", session.getString("refresh"))
            .put("requestId", pending.getString("requestId")).put("nextAccess", pending.getString("nextAccess"))
            .put("nextRefresh", pending.getString("nextRefresh")))
        check(result.getString("userId") == session.getString("userId")) { "账户发生变化，请重新配对" }
        result.put("access", pending.getString("nextAccess")).put("refresh", pending.getString("nextRefresh"))
        store.transaction { store.put("session", result.toString()); store.remove("refresh-pending") }
        return result
    }
}
class DeviceException(val status: Int, message: String) : Exception(message)
