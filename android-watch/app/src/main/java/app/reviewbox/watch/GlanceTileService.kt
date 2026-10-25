package app.reviewbox.watch

import androidx.wear.tiles.TileService
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders
import androidx.concurrent.futures.CallbackToFutureAdapter
import com.google.common.util.concurrent.ListenableFuture

/** Optional system integration. The native launcher remains available on China OS without a Tiles host. */
class GlanceTileService : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val activity=ActionBuilders.AndroidActivity.Builder().setPackageName(packageName).setClassName(MainActivity::class.java.name)
            .addKeyToExtraMapping("glance",ActionBuilders.AndroidBooleanExtra.Builder().setValue(true).build()).build()
        val clickable=ModifiersBuilders.Clickable.Builder().setId("glance-question").setOnClick(ActionBuilders.LaunchAction.Builder().setAndroidActivity(activity).build()).build()
        fun text(value:String,color:Int)=LayoutElementBuilders.Text.Builder().setText(value).setMaxLines(2)
            .setFontStyle(LayoutElementBuilders.FontStyle.Builder().setColor(ColorBuilders.ColorProp.Builder().setArgb(color).build()).build()).build()
        val root=LayoutElementBuilders.Column.Builder()
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(clickable).build())
            .addContent(text("Reviewbox",0xFF58BDF8.toInt())).addContent(text("来一道复习",0xFFF1F5FA.toInt()))
            .addContent(text("点击继续 · 不在卡片中提交答案",0xFFB8C5D3.toInt())).build()
        val timeline=TimelineBuilders.Timeline.Builder().addTimelineEntry(TimelineBuilders.TimelineEntry.Builder()
            .setLayout(LayoutElementBuilders.Layout.Builder().setRoot(root).build()).build()).build()
        return CallbackToFutureAdapter.getFuture { future -> future.set(TileBuilders.Tile.Builder().setResourcesVersion("1").setTileTimeline(timeline).build()); "glance-tile" }
    }
    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        CallbackToFutureAdapter.getFuture { future -> future.set(ResourceBuilders.Resources.Builder().setVersion("1").build()); "glance-resources" }
}
