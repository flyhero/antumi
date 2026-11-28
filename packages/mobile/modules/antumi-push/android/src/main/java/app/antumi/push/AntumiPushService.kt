package app.antumi.push

import org.json.JSONObject
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

// Started by the connector when the distributor has news, the app's JS running or not.
class AntumiPushService : PushService() {
  override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
    val keys = endpoint.pubKeySet
    // Without Web Push keys a push could not be encrypted to this phone, so none is asked for.
    val value: Map<String, Any> = if (keys == null) mapOf("failed" to "NO_KEYS")
    else mapOf("endpoint" to endpoint.url, "p256dh" to keys.pubKey, "auth" to keys.auth)
    PushStore.write(this, instance, value)
  }

  override fun onRegistrationFailed(reason: FailedReason, instance: String) {
    PushStore.write(this, instance, mapOf("failed" to reason.name))
  }

  override fun onUnregistered(instance: String) {
    PushStore.write(this, instance, null)
  }

  override fun onMessage(message: PushMessage, instance: String) {
    // Only what this computer encrypted to this phone's keys.
    if (!message.decrypted) return
    val payload = try { JSONObject(String(message.content, Charsets.UTF_8)) } catch (_: Exception) { return }
    if (payload.optInt("v") != 1) return
    val computer = payload.optString("c")
    val conversation = payload.optString("id")
    if (computer != instance || conversation.isEmpty()) return
    if (PushStore.onScreen == conversation) return
    PushNotifications.show(this, computer, conversation, payload.optString("alert"), payload.optString("title"))
  }
}
