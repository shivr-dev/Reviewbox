package app.reviewbox.watch

import org.json.JSONObject
import org.json.JSONArray

/** Local-only packages remain visible after removal from the cloud catalogue. */
internal fun offlinePackages(snapshot: JSONObject, cached: List<JSONObject>): List<JSONObject> {
    val catalog = snapshot.optJSONArray("packages")?.objects().orEmpty()
    val requests = snapshot.optJSONArray("downloads")?.objects().orEmpty()
    val entries = linkedMapOf<String, JSONObject>()
    (catalog + requests).forEach { entry ->
        val id = entry.optString("packId")
        if (id.isNotBlank() && !entries.containsKey(id)) entries[id] = JSONObject(entry.toString()).put("packId", id)
    }
    cached.forEach { entry ->
        val id = entry.optString("id", entry.optString("subject"))
        if (id.isNotBlank() && !entries.containsKey(id)) {
            entries[id] = JSONObject(entry.toString()).put("packId", id).put("downloadable", false)
                .put("unavailableReason", "云端列表暂无此包；本机内容仍可使用或删除")
        }
    }
    return entries.values.toList()
}

internal data class OfflineRemoval(val packages: List<JSONObject>, val records: List<JSONObject>)

/** Removing a cache must never delete evidence, grades, manifests or shared questions. */
internal fun offlineRemoval(packs: List<JSONObject>, packId: String, records: List<JSONObject>, active: JSONObject?): OfflineRemoval {
    val selected=packs.find { it.optString("id",it.optString("subject"))==packId }?:error("学习包不存在")
    fun ids(pack:JSONObject): Set<String> {
        val a=pack.optJSONArray("questionIds")?:JSONArray()
        return (0 until a.length()).map { a.getString(it) }.toSet()
    }
    val removed=ids(selected)
    check(active?.optJSONArray("queue")?.objects().orEmpty().none { it.optJSONObject("question")?.optString("id") in removed }) {
        "请先完成或结束当前练习，再删除其离线学习包"
    }
    val remaining=packs.filter { it!==selected }
    val shared=remaining.flatMap { ids(it) }.toSet()
    return OfflineRemoval(remaining,records.filter { it.optString("kind")!="question" || it.optString("id") !in removed || it.optString("id") in shared })
}
