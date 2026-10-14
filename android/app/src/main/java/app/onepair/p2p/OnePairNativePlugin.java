package app.onepair.p2p;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native glue for things the web layer can't do well on Android:
 *  • instant notifications (LocalNotifications routes "now" through AlarmManager → up to a minute late)
 *  • a ringing, full-screen incoming-call notification with Answer / Decline
 *  • the keep-alive foreground service and battery-optimisation exemption
 */
@CapacitorPlugin(name = "OnePairNative")
public class OnePairNativePlugin extends Plugin {
    static final String CH_MESSAGES = "messages";
    static final String CH_CALLS = "calls_v1";
    static final int CALL_ID = 7000;
    static final String ACTION_DECLINE = "app.onepair.p2p.CALL_DECLINE";
    static final String EXTRA_CALL_ACTION = "onepair_call_action";
    static final String EXTRA_ROUTE = "onepair_route";

    private static OnePairNativePlugin instance;
    private static String pendingAction;
    private static String pendingRoute;
    private BroadcastReceiver declineReceiver;

    @Override
    public void load() {
        instance = this;
        createChannels(getContext());
        declineReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                stopRinging(c);
                emitCallAction("decline");
            }
        };
        ContextCompat.registerReceiver(getContext(), declineReceiver, new IntentFilter(ACTION_DECLINE), ContextCompat.RECEIVER_NOT_EXPORTED);
        if (pendingAction != null) {
            emitCallAction(pendingAction);
            pendingAction = null;
        }
        if (pendingRoute != null) {
            emitRoute(pendingRoute);
            pendingRoute = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(declineReceiver);
        } catch (Exception ignored) {
        }
        if (instance == this) instance = null;
    }

    static void createChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH_MESSAGES) == null) {
            NotificationChannel m = new NotificationChannel(CH_MESSAGES, "Messages & touches", NotificationManager.IMPORTANCE_HIGH);
            m.setDescription("New messages, touches and missed calls from your pair");
            m.enableVibration(true);
            m.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            nm.createNotificationChannel(m);
        }
        if (nm.getNotificationChannel(CH_CALLS) == null) {
            NotificationChannel c = new NotificationChannel(CH_CALLS, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
            c.setDescription("Rings when your pair calls you");
            Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            c.setSound(ring, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            c.enableVibration(true);
            c.setVibrationPattern(new long[]{0, 800, 600, 800, 600, 800});
            c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(c);
        }
        KeepAliveService.ensureChannel(ctx);
    }

    /** Called by MainActivity for launches/new intents (Answer action, full-screen call intent). */
    static void handleIntent(Activity activity, Intent intent) {
        if (intent == null) return;
        String route = intent.getStringExtra(EXTRA_ROUTE);
        if (route != null) {
            intent.removeExtra(EXTRA_ROUTE);
            if (instance != null) instance.emitRoute(route);
            else pendingRoute = route;
        }
        String action = intent.getStringExtra(EXTRA_CALL_ACTION);
        if (action == null) return;
        intent.removeExtra(EXTRA_CALL_ACTION);
        if (Build.VERSION.SDK_INT >= 27) {
            // Let the incoming-call screen appear over the lock screen and wake the display.
            activity.setShowWhenLocked(true);
            activity.setTurnScreenOn(true);
        }
        if ("answer".equals(action)) stopRinging(activity);
        if (instance != null) instance.emitCallAction(action);
        else pendingAction = action;
    }

    /** Notification tapped: tell the web layer which screen to open (retained until a listener attaches). */
    private void emitRoute(String route) {
        JSObject data = new JSObject();
        data.put("route", route);
        notifyListeners("openRoute", data, true);
    }

    private void emitCallAction(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("callAction", data, true);
    }

    private PendingIntent activityIntent(int req, String callAction) {
        return activityIntent(req, callAction, null);
    }

    private PendingIntent activityIntent(int req, String callAction, String route) {
        Context ctx = getContext();
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (callAction != null) i.putExtra(EXTRA_CALL_ACTION, callAction);
        if (route != null) i.putExtra(EXTRA_ROUTE, route);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @PluginMethod
    public void show(PluginCall call) {
        Context ctx = getContext();
        String body = call.getString("body", "");
        int id = call.getInt("id", (int) (System.currentTimeMillis() % 100000));
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_heart)
            .setColor(0xFFE8577E)
            .setContentTitle(call.getString("title", "OnePair"))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(activityIntent(100 + id, null, call.getString("route")))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setGroup("onepair-messages");
        try {
            NotificationManagerCompat.from(ctx).notify(id, b.build());
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Notification permission not granted");
        }
    }

    @PluginMethod
    public void showCall(PluginCall call) {
        Context ctx = getContext();
        String name = call.getString("name", "Your pair");
        boolean video = Boolean.TRUE.equals(call.getBoolean("video", false));

        Intent decline = new Intent(ACTION_DECLINE).setPackage(ctx.getPackageName());
        PendingIntent declinePi = PendingIntent.getBroadcast(ctx, 2, decline, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent ringing = activityIntent(3, "show");

        Person caller = new Person.Builder().setName(name).setImportant(true).build();
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_CALLS)
            .setSmallIcon(R.drawable.ic_stat_heart)
            .setColor(0xFFE8577E)
            .setContentTitle(name)
            .setContentText(video ? "Incoming video call" : "Incoming voice call")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(ringing)
            // Android 14+: shown full-screen only if the user allowed it; otherwise a persistent heads-up.
            .setFullScreenIntent(ringing, true)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePi, activityIntent(4, "answer")).setIsVideo(video));
        try {
            Notification n = b.build();
            n.flags |= Notification.FLAG_INSISTENT; // keep ringing until answered/declined
            // CallStyle needs to be attached to a foreground service to stay on screen – use the keep-alive one.
            if (!KeepAliveService.showRinging(ctx, n)) {
                Notification standalone = b.setTimeoutAfter(50_000).build();
                standalone.flags |= Notification.FLAG_INSISTENT;
                NotificationManagerCompat.from(ctx).notify(CALL_ID, standalone);
            }
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Notification permission not granted");
        }
    }

    static void stopRinging(Context ctx) {
        NotificationManagerCompat.from(ctx).cancel(CALL_ID);
        KeepAliveService.stopRinging(ctx);
    }

    /** Chat is on screen: remove message notifications (keeps the service and call notifications). */
    @PluginMethod
    public void clearMessages(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getContext().getSystemService(NotificationManager.class);
            for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
                if (CH_MESSAGES.equals(sbn.getNotification().getChannelId())) nm.cancel(sbn.getTag(), sbn.getId());
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelCall(PluginCall call) {
        stopRinging(getContext());
        Activity a = getActivity();
        if (a != null && Build.VERSION.SDK_INT >= 27) {
            a.runOnUiThread(() -> {
                a.setShowWhenLocked(false);
                a.setTurnScreenOn(false);
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void startKeepAlive(PluginCall call) {
        try {
            KeepAliveService.start(getContext(), Boolean.TRUE.equals(call.getBoolean("callAudio", false)), Boolean.TRUE.equals(call.getBoolean("callVideo", false)));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void stopKeepAlive(PluginCall call) {
        KeepAliveService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void batteryStatus(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject r = new JSObject();
        r.put("unrestricted", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        r.put("serviceRunning", KeepAliveService.running);
        call.resolve(r);
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        }
        call.resolve();
    }
}
