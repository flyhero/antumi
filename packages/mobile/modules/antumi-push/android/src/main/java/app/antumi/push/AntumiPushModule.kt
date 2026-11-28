package app.antumi.push

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.unifiedpush.android.connector.UnifiedPush

// UnifiedPush for JS (src/push.ts): pick the distributor, register one instance per paired
// computer with its VAPID key, and read back the endpoint the service stored.
class AntumiPushModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("AntumiPush")

    Events("changed")

    OnCreate {
      PushStore.changed = { instance -> sendEvent("changed", mapOf("instance" to instance)) }
    }

    OnDestroy {
      PushStore.changed = null
    }

    // Distributors installed on the phone, by package name.
    Function("distributors") { UnifiedPush.getDistributors(context) }

    // The one in use, or null before one is picked.
    Function("distributor") { UnifiedPush.getAckDistributor(context) ?: UnifiedPush.getSavedDistributor(context) }

    // Takes the one in use or the phone's default, asking the user to pick when there are several.
    AsyncFunction("useDistributor") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) promise.resolve(false)
      else UnifiedPush.tryUseCurrentOrDefaultDistributor(activity) { success -> promise.resolve(success) }
    }

    Function("register") { instance: String, vapid: String ->
      UnifiedPush.register(context, instance, null, vapid)
    }

    Function("unregister") { instance: String ->
      UnifiedPush.unregister(context, instance)
      PushStore.write(context, instance, null)
    }

    // Stops every registration and forgets the distributor.
    Function("stop") {
      UnifiedPush.removeDistributor(context)
      PushStore.clear(context)
    }

    // { endpoint, p256dh, auth }, { failed: reason }, or null.
    Function("registration") { instance: String -> PushStore.read(context, instance) }

    Function("setOnScreen") { conversation: String? -> PushStore.onScreen = conversation }

    Function("notificationsAllowed") { NotificationManagerCompat.from(context).areNotificationsEnabled() }

    // The app's own page in system settings, where battery and (on some phones) autostart are.
    Function("openAppSettings") {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }
}
