package app.reviewbox.watch

import android.content.Context
import com.dokar.quickjs.QuickJs
import com.dokar.quickjs.binding.function
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/** Same bundled learning algorithms as the website, without a WebView or GMS.
 * Only installed code and JSON data are evaluated. No network, filesystem or reflection bindings. */
class LearningCore(context: Context) {
    private val source = context.assets.open("watch-core.js").bufferedReader().use { it.readText() }
    private val lock = Mutex()
    private var engine: QuickJs? = null
    @Volatile private var closed = false

    private suspend fun runtime(): QuickJs {
        check(!closed) { "学习引擎已关闭" }
        engine?.let { return it }
        val js = QuickJs.create(Dispatchers.Default)
        try {
            js.memoryLimit = 64L * 1024 * 1024
            js.maxStackSize = 1024L * 1024
            js.function("reviewLocalZone") { _: Array<Any?> -> ZoneId.systemDefault().id }
            js.function("reviewValidateZone") { args: Array<Any?> -> ZoneId.of(args[0] as String).id }
            js.function("reviewDateDay") { args: Array<Any?> ->
                Instant.ofEpochMilli((args[0] as String).toLong()).atZone(ZoneId.of(args[1] as String)).toLocalDate().toString()
            }
            js.function("reviewUuid") { _: Array<Any?> -> UUID.randomUUID().toString() }
            // QuickJS has no ICU. Bridge only the audited ISO-date API used by this bundle.
            // Unsupported future formatting fails explicitly instead of silently changing dates.
            js.evaluate<Any?>("""
                globalThis.Intl = { DateTimeFormat: function(locale, options) {
                    const o = options || {};
                    const zone = reviewValidateZone(o.timeZone || reviewLocalZone());
                    if (locale != null && locale !== 'en-CA') throw new Error('Unsupported date locale');
                    for (const key of Object.keys(o)) if (!['timeZone','year','month','day'].includes(key)) throw new Error('Unsupported date option: '+key);
                    if (o.year && o.year !== 'numeric' || o.month && o.month !== '2-digit' || o.day && o.day !== '2-digit') throw new Error('Unsupported date format');
                    return { resolvedOptions: () => ({timeZone: zone}), format: value => {
                        const stamp = value === undefined ? Date.now() : Number(value);
                        if (!Number.isFinite(stamp)) throw new RangeError('Invalid time value');
                        return reviewDateDay(String(Math.trunc(stamp)), zone);
                    }};
                }};
                globalThis.crypto = {randomUUID: () => reviewUuid()};
                if (!Object.hasOwn) Object.hasOwn = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
                if (!Array.prototype.at) Array.prototype.at = function(i) {return this[i < 0 ? this.length+i : i]};
                void 0;
            """.trimIndent())
            // The bundle ends with an exports object containing JS functions. Keep it inside JS;
            // only JSON result strings cross the native boundary.
            js.evaluate<Any?>(source + "\n;void 0;", filename = "watch-core.js")
            engine = js
            return js
        } catch (e: Throwable) { js.close(); throw e }
    }

    suspend fun invoke(request: JSONObject): Any = withContext(Dispatchers.Default) {
        lock.withLock {
            val js = runtime()
            val expression = "JSON.stringify(ReviewWatchCore.watchCore(JSON.parse(" + JSONObject.quote(request.toString()) + ")))"
            org.json.JSONTokener(js.evaluate<String>(expression)).nextValue()
        }
    }

    fun close() {
        closed = true
        // Includes lazy initialization in the same lock; never destroy a half-built runtime.
        CoroutineScope(Dispatchers.Default).launch {
            lock.withLock { engine?.close(); engine = null }
        }
    }
}
