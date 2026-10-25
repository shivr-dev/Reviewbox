package app.reviewbox.watch

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class OfflinePackagesTest {
    private fun pack(id:String,vararg questions:String)=JSONObject().put("id",id).put("title",id).put("version","1").put("questionIds",JSONArray(questions.toList()))
    private fun row(id:String,kind:String)=JSONObject().put("id",id).put("kind",kind)
    @Test fun catalogDeduplicatesWebRequestsAndKeepsLocalOnlyPacks() {
        val snapshot=JSONObject().put("packages",JSONArray().put(JSONObject().put("packId","a").put("title","正确包名").put("downloadable",false)))
            .put("downloads",JSONArray().put(JSONObject().put("packId","a").put("title","过期包名")))
        val result=offlinePackages(snapshot,listOf(pack("a","shared"),pack("local","q")))
        assertEquals(listOf("a","local"),result.map { it.getString("packId") })
        assertEquals("正确包名",result[0].getString("title"));assertFalse(result[0].getBoolean("downloadable"))
        assertFalse(result[1].getBoolean("downloadable"))
    }
    @Test fun removalKeepsSharedQuestionsEvidenceGradesAndCloudManifest() {
        val records=listOf(row("only-a","question"),row("shared","question"),row("only-b","question"),row("evidence","event"),row("grade","exam"),row("a","pack"))
        val result=offlineRemoval(listOf(pack("a","only-a","shared"),pack("b","shared","only-b")),"a",records,null)
        assertEquals(listOf("b"),result.packages.map { it.getString("id") })
        assertEquals(listOf("shared","only-b","evidence","grade","a"),result.records.map { it.getString("id") })
    }
    @Test fun activePracticeBlocksRemovalBeforeAnyMutation() {
        val packs=listOf(pack("a","q"));val records=listOf(row("q","question"))
        val active=JSONObject().put("queue",JSONArray().put(JSONObject().put("question",JSONObject().put("id","q"))))
        try {offlineRemoval(packs,"a",records,active);fail("Active task must retain its package")}
        catch(e:IllegalStateException){assertTrue(e.message.orEmpty().contains("当前练习"))}
        assertEquals(1,packs.size);assertEquals(1,records.size)
    }
}
