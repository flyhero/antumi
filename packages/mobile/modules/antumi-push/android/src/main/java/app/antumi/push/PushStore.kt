package app.antumi.push

import android.content.Context
import org.json.JSONObject

// What the distributor last said of each registration (one per paired computer, by its key),
// kept for the app to send on: the service may hear it while no JS runs.
object PushStore {
  private const val PREFS = "antumi-push"

  // The conversation open on screen while the app is in front, whose pushes go unshown.
  @Volatile var onScreen: String? = null

  // Set while the module lives, to tell JS a registration changed.
  @Volatile var changed: ((String) -> Unit)? = null

  fun read(context: Context, instance: String): Map<String, Any>? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(instance, null) ?: return null
    val json = JSONObject(raw)
    return json.keys().asSequence().associateWith { json.get(it) }
  }

  fun write(context: Context, instance: String, value: Map<String, Any>?) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
    if (value == null) prefs.remove(instance) else prefs.putString(instance, JSONObject(value).toString())
    prefs.apply()
    changed?.invoke(instance)
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }
}
