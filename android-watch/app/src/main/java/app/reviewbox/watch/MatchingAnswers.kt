package app.reviewbox.watch

import androidx.compose.runtime.*
import org.json.JSONObject

/** Explicit pair selection; serialized IDs use the same JSON mapping as the web scorer. */
@Composable internal fun MatchingAnswers(vm: WatchModel,q:JSONObject) {
    val matching=q.optJSONObject("matching")?:return
    val left=matching.optJSONArray("left")?.objects()?:emptyList()
    val right=matching.optJSONArray("right")?.objects()?:emptyList()
    var selected by remember(q.optString("id")){mutableStateOf("")}
    val map=try { JSONObject(vm.answer.ifBlank{"{}"}) }catch(_:Exception){JSONObject()}
    left.forEach { item ->
        val id=item.getString("id");val choice=map.optString(id)
        Action(item.getString("text")+" → "+(right.find{it.getString("id")==choice}?.getString("text")?:"选择配对"),primary=selected==id){selected=id}
        if(selected==id)right.forEach { option ->AnswerOption(option.getString("text"),choice==option.getString("id")){
            map.put(id,option.getString("id"));vm.updateAnswer(map.toString());selected=""
        } }
    }
}

internal fun matchingAnswerText(q:JSONObject):String = try {
    val mapping=JSONObject(q.getString("answer"));val m=q.getJSONObject("matching")
    m.getJSONArray("left").objects().joinToString("\n") { l ->
        l.getString("text")+" → "+(m.getJSONArray("right").objects().find { it.getString("id")==mapping.optString(l.getString("id")) }?.getString("text")?:"待核对")
    }
}catch(_:Exception){q.optString("answer")}
