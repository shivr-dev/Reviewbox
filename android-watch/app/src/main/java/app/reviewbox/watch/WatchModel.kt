package app.reviewbox.watch

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }
class WatchModel @JvmOverloads constructor(app: Application, client: WatchDeviceClient? = null) : AndroidViewModel(app) {
    val store = SecureStore(app)
    private val api: WatchDeviceClient = client ?: WatchApi(store)
    private val core = LearningCore(app)
    private val mutex = Mutex()
    private var polling: Job? = null
    private var authorizationMonitor: Job? = null
    private var accountEpoch = 0L
    private var foreground = false
    private var lastAutoSyncAttempt = 0L
    var autoSyncError by mutableStateOf(""); private set
    private var lastClaimTick = 0L
    var page by mutableStateOf("welcome"); private set
    private val history = mutableListOf<String>()
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf(""); private set
    var message by mutableStateOf(""); private set
    var snapshot by mutableStateOf(JSONObject()); private set
    var pairing by mutableStateOf<JSONObject?>(null); private set
    var pairingExpired by mutableStateOf(false); private set
    var pairingStatus by mutableStateOf("等待网页授权"); private set
    var queue by mutableStateOf<List<JSONObject>>(emptyList()); private set
    var index by mutableStateOf(0); private set
    var revealed by mutableStateOf(false); private set
    var selfRating by mutableStateOf<String?>(null); private set
    var feedbackSequence by mutableStateOf(0); private set
    var feedbackFailure by mutableStateOf(false); private set
    var testMode by mutableStateOf(false); private set
    var deadline by mutableStateOf(0L); private set
    var sessionTitle by mutableStateOf(""); private set
    var answer by mutableStateOf("")
    var subject by mutableStateOf("all")
    var node by mutableStateOf("")
    var selectedType by mutableStateOf("")
    var detail by mutableStateOf<JSONObject?>(null)
    var demo by mutableStateOf(false); private set
    var pending by mutableStateOf(0); private set
    var downloads by mutableStateOf<List<JSONObject>>(emptyList()); private set
    var publicPackages by mutableStateOf<List<JSONObject>>(emptyList()); private set
    var readingPackId = ""
    var courseId by mutableStateOf(""); private set
    var sectionId by mutableStateOf(""); private set
    var courseFeedback by mutableStateOf(""); private set
    private var checkShownAt = 0L
    fun openCourseSection(course: JSONObject, section: JSONObject) {
        courseId=course.getString("id"); sectionId=section.getString("id"); detail=section; go("course-reader")
    }
    fun openCourseCheck(q: JSONObject) { detail=q; answer=""; courseFeedback=""; checkShownAt=System.currentTimeMillis();go("course-check") }
    private suspend fun applyCommand(command: JSONObject) {
        val device=store.json("session")?.getString("deviceId")?:"demo"
        command.put("deviceId",device)
        val generated=invoke("command",command) as JSONArray
        generated.objects().firstOrNull()?.let { row ->
            records().objects().find { it.getString("id")==row.getString("id") }?.let { command.put("baseUpdatedAt",it.getString("updated_at")) }
        }
        store.transaction {
            val rows=records().objects().associateBy { it.getString("id") }.toMutableMap()
            generated.objects().forEach { rows[it.getString("id")]=it }
            store.put(if(demo)"demo-records" else "records",JSONArray(rows.values.toList()).toString())
            if(!demo) { val pending=store.array("outbox").objects().associateBy { it.getString("id") }.toMutableMap();pending[command.getString("id")]=command;store.put("outbox",JSONArray(pending.values.toList()).toString()) }
        };refresh()
    }
    fun savePreferences(mode:String,minutes:Int)=run {
        val old=snapshot.getJSONObject("settings")
        applyCommand(JSONObject().put("id",UUID.randomUUID().toString()).put("kind","preferences").put("mode",mode).put("minutes",minutes).put("previousMode",old.optString("studyMode","guided")).put("previousMinutes",old.optInt("dailyMinutes",20)))
        message="学习偏好已保存，下一次安排将重新计算"
    }
    fun saveNote(text:String,noteId:String?=null)=run {
        val c=JSONObject().put("id",UUID.randomUUID().toString()).put("kind","note").put("nodeId",node).put("text",text)
        noteId?.let { c.put("noteId",it).put("previousBody",snapshot.getJSONArray("notes").objects().find { n->n.getString("id")==it }?.optString("body")) };applyCommand(c);back();message="笔记已保存，联网后同步"
    }
    fun submitCourseCheck()=run {
        val q=detail?:error("请重新打开课程检验")
        val course=snapshot.getJSONArray("courses").objects().find { it.getString("id")==courseId }?:error("课程未同步")
        val section=course.getJSONArray("sections").objects().find { it.getString("id")==sectionId }?:error("课程小节未同步")
        val at=Instant.now().toString();val elapsed=(System.currentTimeMillis()-checkShownAt).coerceIn(0,30000)
        val timing=JSONObject().put("occurredAt",at).put("displayedAt",Instant.ofEpochMilli(checkShownAt).toString()).put("revealedAt",at)
            .put("activeThinkMs",elapsed).put("wallTimeMs",(System.currentTimeMillis()-checkShownAt).coerceAtLeast(elapsed)).put("idleMs",0).put("timeZone",java.time.ZoneId.systemDefault().id)
        applyCommand(JSONObject().put("id",UUID.randomUUID().toString()).put("kind","course-check").put("courseId",courseId).put("sectionId",sectionId)
            .put("revision",section.getInt("revision")).put("questionId",q.getString("id")).put("answer",answer).put("timing",timing))
        courseFeedback=(if(answer==q.getString("answer"))"已通过" else "再检查一下")+"\n"+q.optString("explanation")
        feedbackFailure=answer!=q.getString("answer");feedbackSequence++
    }
    fun returnToCourseSection() {
        val c=snapshot.optJSONArray("courses")?.objects()?.find { it.getString("id")==courseId }?:return
        detail=c.getJSONArray("sections").objects().find { it.getString("id")==sectionId };courseFeedback="";go("course-reader")
    }
    fun completeCourseSection()=run {
        val section=detail?:error("课程小节不存在")
        applyCommand(JSONObject().put("id",UUID.randomUUID().toString()).put("kind","course-section").put("courseId",courseId).put("sectionId",sectionId).put("revision",section.getInt("revision")))
        val c=snapshot.getJSONArray("courses").objects().find { it.getString("id")==courseId }!!
        val next=c.getJSONArray("sections").objects().find { !it.has("completedAt") }
        if(next!=null){detail=next;sectionId=next.getString("id");go("course-reader")}
        else {detail=c;go("course-consolidation")}
    }
    fun startCoursePractice(verify:Boolean=false)=run {beginNativeSession(JSONObject().put("courseId",courseId).put("coursePhase",if(verify)"verify" else "practice"))}
    fun manualQuestion(): Boolean = queue.getOrNull(index)?.optJSONObject("presentation")?.optBoolean("manualCheck") == true
    fun pinyinQuestion(): Boolean = queue.getOrNull(index)?.optJSONObject("presentation")?.optBoolean("pinyin") == true
    private suspend fun presentQuestions(items: List<JSONObject>): List<JSONObject> {
        for (item in items) item.put("presentation", invoke("presentation", item.getJSONObject("question")))
        return items
    }
    private var sessionId = ""
    private var displayedAt = ""
    private var revealedAt = ""
    private var startTick = 0L
    private var activeMs = 0L
    private var lastTouch = 0L
    private var lastTick = 0L
    private var answerWallMs = 0L
    private var completionPending = false

    init {
        // Restore the encrypted pending proof before initializing the learning kernel.
        // Switching to the browser must not lose a pairing after Android reclaims this process.
        if (store.json("session") == null) {
            pairing = store.json("pairing")
            pairingExpired = store.get("pairing-expired") == "1"
            if (pairing != null) {
                page = "pair"
                if (pairingExpired) pairingStatus = "配对已过期，请重新生成配对码"
            }
        }
        run {
            demo = store.get("demo-mode") == "1" && pairing == null
            // Retain the saved task, but let the user explicitly choose Continue on cold start.
            refresh(); if (demo) page = "home"
            startAuthorizationMonitor()
        }
    }
    fun go(next: String) { if (next == page) return; touch(); history.add(page); page = next; if (next != "home-details") { error = ""; message = "" } }
    fun back() { touch(); saveSession(); page = if (history.isEmpty()) if (store.json("session") != null || demo) "home" else "welcome" else history.removeAt(history.lastIndex); error = "" }
    fun saveAndExit() { touch(); saveSession(); history.clear(); page = "home"; message = "进度已保存" }
    fun returnToQuestion() {
        touch(); saveSession()
        while (history.lastOrNull() in listOf("question-menu", "question-reader", "recall-rating")) history.removeAt(history.lastIndex)
        if (history.lastOrNull() == "question") history.removeAt(history.lastIndex)
        page = "question"; error = ""
    }
    fun rateRecall(rating: String) {
        if (!revealed || rating !in StudyGestures.Ratings || busy) return
        selfRating = rating; touch(); saveSession()
    }
    fun bookmarkCurrent() {
        val q = queue.getOrNull(index)?.optJSONObject("question") ?: return
        val key = if (demo) "demo-bookmarks" else "bookmarks"
        val bookmarks = store.array(key).objects().associateBy { it.getString("id") }.toMutableMap()
        val id = q.getString("id")
        if (bookmarks.remove(id) == null) {
            bookmarks[id] = JSONObject().put("id", id).put("title", q.optString("prompt")).put("savedAt", Instant.now().toString())
            message = "已加入本机收藏"
        } else message = "已移出本机收藏"
        store.put(key, JSONArray(bookmarks.values.toList()).toString())
    }
    fun bookmarks(): List<JSONObject> = store.array(if (demo) "demo-bookmarks" else "bookmarks").objects()
    fun dismiss() { error = ""; message = "" }
    private fun records() = store.array(if (demo) "demo-records" else "records")
    private suspend fun invoke(op: String, input: JSONObject = JSONObject()): Any {
        input.put("deviceId",store.json("session")?.optString("deviceId")?:"demo")
        return core.invoke(JSONObject().put("op", op).put("records", records()).put("input", input))
    }
    private suspend fun refresh() {
        snapshot = invoke("snapshot") as JSONObject
        // Pending local evidence wins until acknowledged; never cover it with an older cloud plan.
        if(!demo&&store.array("outbox").length()==0)store.json("cloud-plan")?.let { plan ->
            val age=System.currentTimeMillis()-backendTimeMillis(plan.getString("computedAt"))
            if(age in -300000..3600000) snapshot.put("recommendation",plan.getJSONObject("recommendation")).put("actions",plan.getJSONArray("actions"))
                .put("planSource","cloud").put("planComputedAt",plan.optString("computedAt"))
        }
        pending = store.array("outbox").length()
        downloads = store.array("downloaded-packs").objects()
        publicPackages = store.array("public-pack-catalog").objects()
        if (page == "welcome" && store.json("session") != null) page = "home"
    }
    fun run(block: suspend () -> Unit) {
        if (busy) return
        viewModelScope.launch {
            busy = true; error = ""; message = ""
            try { mutex.withLock { block() } }
            catch (e: Exception) {
                if (e is CancellationException) throw e
                if (e is DeviceException && e.status == 401 && store.json("session") != null) {
                    authorizationLost()
                } else error = e.message ?: "操作失败，请重试"
                feedbackFailure = true; feedbackSequence++
            }
            finally { busy = false }
        }
    }
    fun beginPairing() = run {
        demo = false; store.remove("demo-mode")
        val p = JSONObject().put("device", WatchApi.secret()).put("verifier", WatchApi.secret())
            .put("access", WatchApi.secret()).put("refresh", WatchApi.secret())
        val result = api.request("begin", JSONObject().put("device", p.getString("device"))
            .put("challenge", WatchApi.sha(p.getString("verifier"))).put("name", android.os.Build.MODEL)
            .put("platform", "ColorOS / Android ${android.os.Build.VERSION.RELEASE}"))
        result.keys().forEach { p.put(it, result.get(it)) }
        store.transaction { store.put("pairing", p.toString()); store.remove("pairing-expired") }
        pairing = p; pairingExpired = false; pairingStatus = "等待网页授权"; lastClaimTick = 0
        if (page != "pair") go("pair")
        startPolling()
    }
    private fun startPolling() {
        polling?.cancel()
        polling = viewModelScope.launch {
            while (foreground && pairing != null && !pairingExpired) {
                if (!busy) claimPairing()
                delay(5000)
            }
        }
    }
    fun claimPairing() = run {
        val p = pairing ?: store.json("pairing") ?: return@run
        val tick = android.os.SystemClock.elapsedRealtime()
        if (lastClaimTick != 0L && tick - lastClaimTick < 5000) return@run
        lastClaimTick = tick
        pairingStatus = "正在检查网页授权…"
        // Server expiry is authoritative. A wrong watch clock must not prevent the first claim.
        val result = try {
            api.request("claim", JSONObject().put("device", p.getString("device")).put("verifier", p.getString("verifier"))
                .put("access", p.getString("access")).put("refresh", p.getString("refresh")))
        } catch (e: DeviceException) {
            if (e.message?.contains("expired pairing", ignoreCase = true) == true ||
                e.message?.contains("already used", ignoreCase = true) == true) {
                pairingExpired = true; store.put("pairing-expired", "1"); polling?.cancel()
                pairingStatus = "配对已过期或已取消，请重新生成配对码"
            } else pairingStatus = "暂时未连接，请检查网络后重试"
            throw e
        }
        // Ignore late responses after the user cancelled or replaced this pairing.
        if (pairing?.optString("device") != p.getString("device")) return@run
        if (!result.optBoolean("pending")) {
            check(result.optString("deviceId").isNotEmpty() && result.optString("userId").isNotEmpty()) { "设备连接结果不完整，请重试" }
            store.wipe() // Account boundary: no previous account's records/outbox survive pairing.
            result.put("access", p.getString("access")).put("refresh", p.getString("refresh"))
            store.put("session", result.toString()); pairing = null; polling?.cancel(); history.clear(); page = "home"
            demo = false; snapshot = JSONObject(); detail = null; queue = emptyList(); downloads = emptyList(); pending = 0
            message = "账户已连接，正在同步资料"
            syncInternal(); refresh(); message = "账户已连接"; startAuthorizationMonitor()
        } else pairingStatus = "尚未收到网页授权，批准后会自动连接"
    }
    fun cancelPairing() {
        polling?.cancel(); pairing = null; pairingExpired = false
        store.transaction { store.remove("pairing"); store.remove("pairing-expired") }
        history.clear(); page = "welcome"
    }
    fun pause() { foreground = false; tick(false); polling?.cancel(); authorizationMonitor?.cancel(); authorizationMonitor=null }
    fun resume() { foreground = true; lastTick = android.os.SystemClock.elapsedRealtime(); lastTouch = lastTick; if (pairing != null && !pairingExpired) startPolling(); startAuthorizationMonitor() }
    private fun startAuthorizationMonitor() {
        if(!foreground || demo || store.json("session")==null || authorizationMonitor?.isActive==true)return
        authorizationMonitor=viewModelScope.launch {
            while(foreground && !demo && store.json("session")!=null) {
                if(!busy && mutex.tryLock()) {
                    val epoch=accountEpoch
                    try {
                        api.authorized("status")
                        val now=android.os.SystemClock.elapsedRealtime()
                        if(page in listOf("home","home-details","plan","hub","downloads","subjects","nodes","profile","results") && (lastAutoSyncAttempt==0L||now-lastAutoSyncAttempt>=60000)) {
                            lastAutoSyncAttempt=now;busy=true
                            syncInternal();refresh();autoSyncError=""
                        }
                    }
                    catch(e:CancellationException){throw e}
                    catch(e:Exception){
                        // Offline and server errors preserve the account. Only authoritative revocation logs out.
                        if(e is DeviceException && e.status==401 && epoch==accountEpoch && store.json("session")!=null)authorizationLost()
                        else autoSyncError="暂未同步最新安排，联网后可重试"
                    } finally { busy=false;mutex.unlock() }
                }
                delay(15000)
            }
        }
    }
    private fun authorizationLost() {
        clearProtectedState(); error=""; message="已解绑 · 设备授权已撤销或到期，请重新连接账户"
        feedbackFailure=true;feedbackSequence++
    }
    fun touch() { tick(true) }
    fun updateAnswer(value: String) { answer = value; touch(); saveSession() }
    private fun tick(interaction: Boolean) {
        val now = android.os.SystemClock.elapsedRealtime()
        if (lastTick > 0 && page in listOf("question", "question-reader") && !revealed) activeMs += (minOf(now, lastTouch + 30000) - lastTick).coerceAtLeast(0)
        lastTick = now; if (interaction) lastTouch = now
    }
    fun sync() = run { check(!demo) { "演示数据不会同步到账户" }; syncInternal(); refresh();autoSyncError=""; message = "资料与学习计划已更新" }
    private suspend fun syncInternal() {
        val status = api.authorized("status")
        val generation = status.getString("generation")
        val oldGeneration = store.get("generation")
        if (oldGeneration != null && oldGeneration != generation) error("网页学习数据已重置。手表缓存和未上传作答已保留，请在设备页确认如何处理。")
        store.put("generation", generation)
        val outbox = store.array("outbox").objects()
        for (batch in outbox.chunked(20)) {
            api.authorized("push", JSONObject().put("generation", generation).put("coreVersion", "review-watch-1").put("commands", JSONArray(batch)))
            val accepted = batch.map { it.getString("id") }.toSet()
            store.put("outbox", JSONArray(store.array("outbox").objects().filter { it.getString("id") !in accepted }).toString())
        }
        var more = true
        while (more) {
            val cursor = store.json("cursor") ?: JSONObject()
            val result = api.authorized("pull", JSONObject().put("generation", generation)
                .put("cursorTime", cursor.optString("time", "1970-01-01T00:00:00Z")).put("cursorId", cursor.optString("id", ""))
                .put("questionIds", JSONArray((store.array("downloaded-packs").objects().flatMap { p ->
                    val ids = p.optJSONArray("questionIds") ?: JSONArray(); (0 until ids.length()).map { ids.getString(it) }
                }+(0 until store.array("plan-question-ids").length()).map {store.array("plan-question-ids").getString(it)}).distinct())))
            val incoming = result.getJSONArray("records").objects()
            val merged = records().objects().associateBy { it.getString("id") }.toMutableMap()
            incoming.forEach { merged[it.getString("id")] = it }
            store.transaction {
                store.put("records", JSONArray(merged.values.toList()).toString())
                incoming.lastOrNull()?.let { store.put("cursor", JSONObject().put("time", it.getString("updated_at")).put("id", it.getString("id")).toString()) }
            }
            more = result.getBoolean("hasMore")
        }
        saveCloudPlan(api.authorized("study-plan"))
        store.put("last-sync", Instant.now().toString())
    }
    private fun saveCloudPlan(result:JSONObject) {
        val incoming=result.getJSONArray("questionRecords").objects()+(result.optJSONArray("taskRecords")?.objects()?:emptyList())
        val plan=JSONObject(result.toString());plan.remove("questionRecords");plan.remove("taskRecords")
        store.transaction {
            val rows=records().objects().associateBy {it.getString("id")}.toMutableMap()
            incoming.forEach {rows[it.getString("id")]=it}
            store.put("records",JSONArray(rows.values.toList()).toString())
            store.put("cloud-plan",plan.toString())
            store.put("plan-question-ids",JSONArray(incoming.filter{it.optString("kind")=="question"}.map{it.getString("id")}).toString())
        }
    }
    fun openPublicPackages() {
        go("public-packages")
        if(!demo)loadPublicPackages()
    }
    fun loadPublicPackages() = run {
        check(!demo) { "公共学习包需要先连接账户" }
        val result=api.authorized("public-pack-list")
        store.put("public-pack-catalog",result.getJSONArray("packs").toString())
        refresh();message=if(publicPackages.isEmpty())"暂时没有公开发布的学习包" else "列表已更新"
    }
    fun downloadedQuestions(packId:String):List<JSONObject> {
        val ids=downloads.find {it.optString("id")==packId}?.optJSONArray("questionIds")?:JSONArray()
        val set=(0 until ids.length()).map {ids.getString(it)}.toSet()
        return records().objects().filter {it.optString("kind")=="question"&&!it.optBoolean("deleted")&&it.optString("id") in set}.map {it.getJSONObject("payload")}
    }
    fun downloadPack(packId: String, course: Boolean = false, publicPack:Boolean=false) = run {
        check(!demo) { "演示内容已随应用提供；个人学习包需要先连接账户" }
        check(store.json("active-session")==null) { "请先完成当前练习，再更新离线学习包" }
        val result = api.authorized(if(publicPack)"public-pack-download" else "download-pack", JSONObject().put(if(publicPack)"publicId" else if(course)"courseId" else "packId", packId))
        val source = result.getString("packageJson")
        check(WatchApi.sha(source) == result.getString("sha256")) { "学习包校验失败，原有下载已保留" }
        val pack = JSONObject(source)
        val localId=if(publicPack)pack.getJSONObject("manifest").getString("id") else packId
        val info = JSONObject().put("id", localId).put("questionIds", JSONArray(pack.getJSONArray("questions").objects().map { it.getString("id") }))
            .put("subject", pack.getJSONObject("manifest").optString("subject")).put("version", pack.getJSONObject("manifest").getString("version"))
            .put("title", pack.getJSONObject("manifest").getString("title")).put("contentHash",pack.getJSONObject("manifest").optString("contentHash"))
            .put("bytes", result.getInt("bytes")).put("questions", pack.getJSONArray("questions").length()).put("downloadedAt", Instant.now().toString())
        val publicId=if(publicPack)packId else downloads.find {it.optString("id")==localId}?.optString("publicId")
        if(!publicId.isNullOrBlank())info.put("publicId",publicId)
        store.transaction {
            val oldPacks=store.array("downloaded-packs").objects()
            val oldRecords=records().objects()
            val retained=if(oldPacks.any{it.optString("id")==localId})offlineRemoval(oldPacks,localId,oldRecords,store.json("active-session")).records else oldRecords
            val all = retained.associateBy { it.getString("id") }.toMutableMap()
            result.getJSONArray("records").objects().forEach { all[it.getString("id")] = it }
            store.put("records", JSONArray(all.values.toList()).toString()); store.put("package:$localId", source)
            store.put("downloaded-packs", JSONArray(store.array("downloaded-packs").objects().filter { it.optString("id") != localId } + info).toString())
        }
        refresh()
        val verified=pack.getJSONArray("questions").objects().count {it.optBoolean("verified")}
        if(publicPack){detail=JSONObject(info.toString()).put("packId",localId).put("downloadable",true);go("offline-package")}
        message = "已下载 ${info.getInt("questions")} 道题 · $verified 题可练习"+if(verified<info.getInt("questions"))"。其余可离线阅读，请在网页核验后同步。" else "，可离线复习"
    }
    fun removeDownload(packId: String) = run {
        check(!demo) { "演示模式不会修改个人离线内容" }
        val packs = store.array("downloaded-packs").objects().map { p ->
            if(!p.has("questionIds")) {
                val id=p.optString("id",p.optString("subject"))
                JSONObject(store.get("package:$id")?:"{}").optJSONArray("questions")?.let { questions ->
                    p.put("questionIds",JSONArray(questions.objects().map { it.getString("id") }))
                }
            }
            p
        }
        val removal=offlineRemoval(packs,packId,records().objects(),store.json("active-session"))
        store.transaction {
            store.remove("package:$packId")
            store.put("downloaded-packs", JSONArray(removal.packages).toString())
            store.put("records", JSONArray(removal.records).toString())
        }
        refresh(); if(page=="offline-delete")back(); message = "已移除离线内容，作答历史和成绩保留；可重新下载"
    }
    fun startPractice(wrong: Boolean = false, one: Boolean = false) = run {
        val input = JSONObject().put("subject", subject).put("manual", true).put("wrong", wrong).put("limit", if (one) 1 else 5)
        if (node.isNotEmpty()) input.put("scope", JSONArray().put(node))
        if (selectedType.isNotEmpty()) input.put("type", selectedType)
        beginNativeSession(input)
    }
    private suspend fun beginNativeSession(options: JSONObject) {
        val device = store.json("session")?.getString("deviceId") ?: "demo"
        val id = "watch-session:$device:" + UUID.randomUUID()
        options.put("sessionId", id).put("deviceId", device).put("startedAt", Instant.now().toString()).put("assessmentOnly",!demo)
        val job = invoke("session-start", options) as JSONObject
        options.put("questionIds", JSONArray(job.getJSONArray("items").objects().map { it.getJSONObject("question").getString("id") }))
            .put("requestedMode", job.getString("mode")).put("pressure", job.optBoolean("pressure"))
        val row = JSONObject().put("id", id).put("kind", "job").put("payload", job).put("updated_at", Instant.now().toString()).put("deleted", false)
        val command = JSONObject().put("id", "start:$id").put("kind", "session-start").put("input", options)
        saveLocal(command, row)
        sessionId = id; queue = presentQuestions(job.getJSONArray("items").objects()); testMode = job.getString("mode") == "test"
        deadline = job.optLong("deadline"); sessionTitle = job.getString("title"); index = 0; go("question"); nextQuestion(); saveSession()
    }
    private fun saveLocal(command: JSONObject, row: JSONObject) {
        store.transaction {
            val rows = records().objects().associateBy { it.getString("id") }.toMutableMap(); rows[row.getString("id")] = row
            store.put(if (demo) "demo-records" else "records", JSONArray(rows.values.toList()).toString())
            if (!demo) {
                val commands = store.array("outbox").objects().associateBy { it.getString("id") }.toMutableMap(); commands[command.getString("id")] = command
                store.put("outbox", JSONArray(commands.values.toList()).toString())
            }
        }
    }
    fun executeAction(action: JSONObject) = run {
        var current = action
        val cloud=if(!demo&&snapshot.optString("planSource")=="cloud")store.json("cloud-plan") else null
        if(cloud!=null&&store.array("outbox").length()==0) {
            try {
                val fresh=api.authorized("study-plan",JSONObject().put("actionId",action.getString("id")))
                saveCloudPlan(fresh);refresh();current=fresh.getJSONObject("selected")
            } catch(e:java.io.IOException) {
                current=cloud.getJSONArray("actions").objects().find{it.optString("id")==action.optString("id")}?:throw e
            }
        } else current = invoke("action", JSONObject().put("id", action.getString("id"))) as JSONObject
        when (current.getString("kind")) {
            "resume" -> restoreTargetSession(current.getString("target"))
            "score" -> {
                detail = snapshot.getJSONArray("exams").objects().find { it.getString("id") == current.getString("examId") } ?: error("考试安排已变化，请同步")
                go("grade")
            }
            "course" -> {
                detail = snapshot.getJSONArray("courses").objects().find { it.getString("id") == current.optString("courseId", current.optString("target")) } ?: error("课程尚未下载，请同步")
                go("course")
            }
            "practice", "verify", "initial", "test", "pressure" -> {
                val options=JSONObject().put("actionId", current.getString("id"))
                current.optJSONArray("questionIds")?.takeIf {it.length()>0}?.let {
                    val known=records().objects().filter{r->r.optString("kind")=="question"&&!r.optBoolean("deleted")}.map{r->r.getString("id")}.toSet()
                    check((0 until it.length()).all{n->it.getString(n) in known}) {"此任务尚未缓存，请联网更新计划后开始"}
                    options.put("questionIds",it).put("requestedMode",if(current.getString("kind") in listOf("initial","test","pressure"))"test" else "review").put("pressure",current.getString("kind")=="pressure")
                }
                beginNativeSession(options)
            }
            "report" -> go("results")
            "rest" -> { detail = current; go("rest") }
            else -> { detail = current; go("task-pending") }
        }
    }
    private fun nextQuestion() {
        answer = ""; revealed = false; selfRating = null; displayedAt = Instant.now().toString(); revealedAt = displayedAt
        startTick = android.os.SystemClock.elapsedRealtime(); activeMs = 0; lastTick = startTick; lastTouch = startTick; answerWallMs = 0
    }
    fun reveal() { if (revealed || busy) return; tick(true); answerWallMs = android.os.SystemClock.elapsedRealtime() - startTick; revealed = true; revealedAt = Instant.now().toString(); saveSession() }
    fun resumePractice() = run {
        val saved = store.json("active-session")
        if (saved != null) restoreSession()
        else snapshot.optJSONArray("actions")?.objects()?.find { it.optString("kind") == "resume" }?.let {
            restoreTargetSession(it.getString("target"))
        } ?: error("没有可恢复的学习进度，请返回今天查看当前安排")
    }
    private suspend fun restoreTargetSession(target: String) {
        if (store.json("active-session")?.optString("id") == target) { restoreSession(); return }
        fun cachedJob()=records().objects().filter { (it.optString("id") == target||it.optJSONObject("payload")?.optString("id")==target) && !it.optBoolean("deleted") }
            .maxByOrNull {runCatching{backendTimeMillis(it.getString("updated_at"))}.getOrDefault(0)}?.optJSONObject("payload")
        if(cachedJob()==null&&!demo){syncInternal();refresh()}
        val job=cachedJob()?:error("暂未取回原测试进度，请连接网络后在手表重试同步；已有作答保留")
        val device = store.json("session")?.optString("deviceId") ?: "demo"
        check(job.optString("kind") == "session" && job.optString("ownerDeviceId") == device) { "这段学习在其他设备开始，请在原设备继续；不会重新生成或覆盖原进度" }
        check(job.optString("status") == "active") { "这段学习已经结束，请更新安排" }
        val items = job.getJSONArray("items").objects()
        val events = records().objects().filter { it.optString("kind") == "event" && !it.optBoolean("deleted") }.map { it.getJSONObject("payload") }
        val next = items.indices.firstOrNull { n -> events.none { it.optString("id") == "watch-event:$device:$target:$n" } } ?: items.size
        store.put("active-session", JSONObject().put("id",target).put("queue",JSONArray(items)).put("index",next)
            .put("answer","").put("revealed",false).put("testMode",job.optString("mode")=="test")
            .put("deadline",job.optLong("deadline")).put("title",job.optString("title")).toString())
        restoreSession()
    }
    fun openReport(id: String) = run { detail = invoke("test-report", JSONObject().put("id", id)) as JSONObject; go("test-report") }
    fun openCurrentReport() = openReport(sessionId)
    fun submit(outcome: String? = null) = run {
        tick(true)
        val q = queue[index].getJSONObject("question")
        if (manualQuestion() && !testMode) {
            check(revealed && outcome in StudyGestures.Ratings) { "请先翻面并明确自评，再继续" }
        }
        val device = store.json("session")?.getString("deviceId") ?: "demo"
        val eventId = "watch-event:$device:$sessionId:$index"
        val at = Instant.now().toString()
        val input = JSONObject().put("eventId", eventId).put("sessionId", sessionId).put("questionId", q.getString("id"))
            .put("deviceId", device)
            .put("timeZone", java.time.ZoneId.systemDefault().id)
            .put("answer", answer).put("occurredAt", at).put("displayedAt", displayedAt).put("revealedAt", if (revealed && !testMode) revealedAt else at)
            .put("activeThinkMs", activeMs).put("wallTimeMs", (if (revealed) answerWallMs else android.os.SystemClock.elapsedRealtime() - startTick).coerceAtLeast(activeMs))
            .put("idleMs", ((if (revealed) answerWallMs else android.os.SystemClock.elapsedRealtime() - startTick) - activeMs).coerceAtLeast(0)).put("confidence", "unsure")
        outcome?.let { input.put("selfOutcome", it) }
        val event = invoke("answer", input) as JSONObject
        val row = JSONObject().put("id", eventId).put("kind", "event").put("payload", event).put("updated_at", at).put("deleted", false)
        store.transaction {
            val rows = records().objects().associateBy { it.getString("id") }.toMutableMap(); rows[eventId] = row
            store.put(if (demo) "demo-records" else "records", JSONArray(rows.values.toList()).toString())
            if (!demo) {
                val commands = store.array("outbox").objects().associateBy { it.getString("id") }.toMutableMap()
                commands[eventId] = JSONObject().put("id", eventId).put("kind", "answer").put("input", input)
                store.put("outbox", JSONArray(commands.values.toList()).toString())
            }
            index++
            if (index < queue.size) nextQuestion()
            else { completionPending = true; page = "session-finishing" }
            saveSession()
        }
        refresh()
        feedbackFailure = false; feedbackSequence++
        if (index >= queue.size) finishCurrentSession()
    }
    private suspend fun finishCurrentSession() {
        val device = store.json("session")?.getString("deviceId") ?: "demo"
        val completed = invoke("session-complete", JSONObject().put("sessionId", sessionId).put("deviceId", device)) as JSONObject
        val finish = JSONObject().put("id", "finish:$sessionId").put("kind", "session-complete").put("sessionId", sessionId)
        val row = JSONObject().put("id", sessionId).put("kind", "job").put("payload", completed).put("updated_at", Instant.now().toString()).put("deleted", false)
        val extras=invoke("completion-records",completed) as JSONArray
        store.transaction {
            saveLocal(finish,row)
            val rows=records().objects().associateBy { it.getString("id") }.toMutableMap()
            extras.objects().forEach { rows[it.getString("id")]=it }
            store.put(if(demo)"demo-records" else "records",JSONArray(rows.values.toList()).toString())
        }; refresh(); completionPending = false; page = "summary"; store.remove("active-session"); message = "学习记录已保存"
    }
    fun retryCompletion() = run { check(completionPending) { "没有待保存的结算" }; finishCurrentSession() }
    private fun saveSession() {
        if (sessionId.isEmpty() || (index >= queue.size && !completionPending)) return
        store.put("active-session", JSONObject().put("id", sessionId).put("queue", JSONArray(queue)).put("index", index).put("answer", answer)
            .put("displayedAt", displayedAt).put("revealedAt", revealedAt).put("revealed", revealed).put("selfRating", selfRating)
            .put("testMode", testMode).put("deadline", deadline).put("title", sessionTitle).toString())
    }
    private suspend fun restoreSession() {
        if (!demo && store.json("session") == null) return
        val saved = store.json("active-session") ?: return
        sessionId = saved.getString("id"); queue = presentQuestions(saved.getJSONArray("queue").objects()); index = saved.getInt("index")
        testMode = saved.optBoolean("testMode"); deadline = saved.optLong("deadline"); sessionTitle = saved.optString("title")
        if (index >= queue.size) { completionPending = true; page = "session-finishing"; finishCurrentSession(); return }
        completionPending = false
        page = "question"; nextQuestion(); answer = saved.optString("answer"); revealed = saved.optBoolean("revealed")
        selfRating = saved.optString("selfRating").takeIf { it in StudyGestures.Ratings && revealed }
        // A resumed answer gets fresh timing; time while the process was absent is never counted as thinking.
    }
    fun grade(exam: JSONObject, score: Double, max: Double, credits: Double) = run {
        check(demo || store.array("outbox").objects().none { it.optString("kind") == "grade" && it.optString("examId") == exam.getString("id") }) { "这场考试有待同步成绩，请先同步再修改" }
        val result = JSONObject().put("score", score).put("maxScore", max).put("credits", credits).put("recordedAt", Instant.now().toString())
        val input = JSONObject(exam.toString()).put("result", result)
        val validated = invoke("grade", input) as JSONObject
        val rows = records().objects().associateBy { it.getString("id") }.toMutableMap()
        val old = rows[exam.getString("id")] ?: error("考试尚未同步")
        val command = JSONObject().put("id", "grade:" + UUID.randomUUID()).put("kind", "grade").put("examId", exam.getString("id"))
            .put("baseUpdatedAt", old.getString("updated_at")).put("result", result)
        old.put("payload", validated); rows[old.getString("id")] = old
        store.transaction {
            store.put(if (demo) "demo-records" else "records", JSONArray(rows.values.toList()).toString())
            if (!demo) {
                val pending = store.array("outbox").objects().associateBy { it.getString("id") }.toMutableMap()
                pending[command.getString("id")] = command
                store.put("outbox", JSONArray(pending.values.toList()).toString())
            }
        }
        refresh(); message = "成绩已保存${if (demo) "（演示）" else "，联网后同步"}"; back()
    }
    fun logout() {
        if(busy)return
        val access=if(!demo)store.json("session")?.optString("access")?.takeIf { it.isNotBlank() } else null
        clearProtectedState();error="";message="已退出 · 手表上的账户与离线数据已清除"
        val epoch=accountEpoch
        if(access!=null)viewModelScope.launch {
            // Local logout never waits for a connection or a refresh-token rotation.
            try {api.request("logout",token=access)}
            catch(e:CancellationException){throw e}
            catch(e:Exception){
                val alreadyUnauthorized=e is DeviceException && e.status==401
                if(epoch==accountEpoch && store.json("session")==null && page=="welcome" && !alreadyUnauthorized) {
                    message="已退出本机 · 网络未确认撤销，可在网页设备页解绑"
                }
            }
        }
    }
    private fun clearProtectedState() {
        accountEpoch++;authorizationMonitor?.cancel();authorizationMonitor=null
        polling?.cancel(); store.wipe(); demo = false; pairing = null; snapshot = JSONObject(); detail = null
        queue = emptyList(); downloads = emptyList(); publicPackages=emptyList(); readingPackId="";autoSyncError="";lastAutoSyncAttempt=0; pending = 0; answer = ""; sessionId = ""; completionPending = false
        courseId="";sectionId="";courseFeedback="";revealed=false;selfRating=null;testMode=false;deadline=0;subject="all";node="";selectedType="";pairingStatus="";pairingExpired=false
        history.clear(); page = "welcome"
    }
    fun startDemo() = run {
        demo = true
        store.put("demo-mode", "1")
        val authored = JSONArray(getApplication<Application>().assets.open("demo-records.json").bufferedReader().use { it.readText() }).objects()
        val merged = store.array("demo-records").objects().associateBy { it.getString("id") }.toMutableMap()
        authored.forEach { row ->
            // Refresh authored content without resetting attempts, earned XP or edited demo scores.
            if (row.optString("kind") in listOf("node", "question") || !merged.containsKey(row.getString("id"))) merged[row.getString("id")] = row
        }
        store.put("demo-records", JSONArray(merged.values.toList()).toString())
        page = "home"; refresh(); message = "演示模式：参考内容，不读取或上传个人数据"
    }
    override fun onCleared() { polling?.cancel();authorizationMonitor?.cancel(); core.close(); store.close() }
}
