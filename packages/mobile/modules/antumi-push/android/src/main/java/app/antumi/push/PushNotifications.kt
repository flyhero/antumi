package app.antumi.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Locale

// A pushed alert as a notification that opens its conversation (antumi://chat?…, as the
// computer's ntfy pushes do), worded in the phone's language as the app is.
object PushNotifications {
  private const val CHANNEL = "conversation-alerts"

  fun show(context: Context, computer: String, conversation: String, alert: String, title: String) {
    val chinese = Locale.getDefault().language == "zh"
    ensureChannel(context, chinese)
    val link = Uri.parse("antumi://chat?c=${Uri.encode(computer)}&id=${Uri.encode(conversation)}")
    // A fresh task: one left from before, its process gone, would come back with the link that
    // first opened it (a pairing link, say) rather than this one.
    val open = Intent(Intent.ACTION_VIEW, link).setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    val id = conversation.hashCode()
    val tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.antumi_push_mark)
      .setContentTitle(title.ifBlank { "Antumi" })
      .setContentText(text(alert, chinese))
      .setContentIntent(tap)
      .setAutoCancel(true)
      .setCategory(if (alert == "waiting") NotificationCompat.CATEGORY_REMINDER else NotificationCompat.CATEGORY_STATUS)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()
    // One per conversation: a newer alert replaces the older. Without the permission, nothing shows.
    try {
      NotificationManagerCompat.from(context).notify(id, notification)
    } catch (_: SecurityException) {
    }
  }

  private fun text(alert: String, chinese: Boolean): String = when (alert) {
    "waiting" -> if (chinese) "在等你确认或回答" else "Waiting for your answer"
    "crashed" -> if (chinese) "Agent 意外退出了" else "The agent exited unexpectedly"
    "finishedAsking" -> if (chinese) "本轮结束，留了一个问题" else "Turn finished, with a question for you"
    else -> if (chinese) "本轮结束了" else "Turn finished"
  }

  private fun ensureChannel(context: Context, chinese: Boolean) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val name = if (chinese) "会话提醒" else "Conversation alerts"
    manager.createNotificationChannel(NotificationChannel(CHANNEL, name, NotificationManager.IMPORTANCE_HIGH))
  }
}
