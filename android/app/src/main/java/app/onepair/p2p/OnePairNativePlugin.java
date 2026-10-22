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
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.atomic.AtomicBoolean;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;

/**
 * Native glue for things the web layer can't do well on Android:
 *  • instant notifications (LocalNotifications routes "now" through AlarmManager → up to a minute late)
 *  • a ringing, full-screen incoming-call notification with Answer / Decline
 *  • the keep-alive foreground service and battery-optimisation exemption
 *  • saving files (backups, chat attachments) through the system "Save as" picker
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
    private volatile PluginCall screenCall;
    private volatile PluginCall screenStopCall;
    private final Handler screenMain = new Handler(Looper.getMainLooper());
    private final AtomicBoolean frameQueued = new AtomicBoolean();

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
        getContext().stopService(new Intent(getContext(), ScreenCaptureService.class));
        ScreenCaptureService.listener = null;
        if (screenCall != null) {screenCall.reject("Screen sharing closed."); screenCall = null;}
        if (screenStopCall != null) {screenStopCall.reject("Screen sharing closed."); screenStopCall = null;}
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

    private static String safeTone(String value) {
        return "bell".equals(value) || "soft".equals(value) || "silent".equals(value) ? value : "chime";
    }

    private static Uri toneSound(Context ctx, String tone) {
        if ("silent".equals(tone)) return null;
        String resource = "bell".equals(tone) ? "notification_bell" : "soft".equals(tone) ? "notification_soft" : "notification_chime";
        return Uri.parse("android.resource://" + ctx.getPackageName() + "/raw/" + resource);
    }

    private static String toneChannel(Context ctx, boolean incomingCall, String tone) {
        String id = (incomingCall ? "calls_v2_" : "messages_v2_") + tone;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm.getNotificationChannel(id) == null) {
                NotificationChannel channel = new NotificationChannel(id, (incomingCall ? "Incoming calls" : "Messages & touches") + " - " + tone, NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription(incomingCall ? "Incoming peer calls using your selected tone" : "Messages, group invites and touches using your selected tone");
                channel.setSound(toneSound(ctx, tone), new AudioAttributes.Builder()
                    .setUsage(incomingCall ? AudioAttributes.USAGE_NOTIFICATION_RINGTONE : AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                channel.enableVibration(!"silent".equals(tone));
                if (incomingCall && !"silent".equals(tone)) channel.setVibrationPattern(new long[]{0, 800, 600, 800});
                channel.setLockscreenVisibility(incomingCall ? Notification.VISIBILITY_PUBLIC : Notification.VISIBILITY_PRIVATE);
                nm.createNotificationChannel(channel);
            }
        }
        return id;
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
        String tone = safeTone(call.getString("tone", "chime"));
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, toneChannel(ctx, false, tone))
            .setSound(toneSound(ctx, tone))
            .setSilent("silent".equals(tone))
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
        String tone = safeTone(call.getString("tone", "chime"));
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, toneChannel(ctx, true, tone))
            .setSound(toneSound(ctx, tone))
            .setSilent("silent".equals(tone))
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
            if (!"silent".equals(tone)) n.flags |= Notification.FLAG_INSISTENT; // keep ringing until answered/declined
            // CallStyle needs to be attached to a foreground service to stay on screen – use the keep-alive one.
            if (!KeepAliveService.showRinging(ctx, n)) {
                Notification standalone = b.setTimeoutAfter(50_000).build();
                if (!"silent".equals(tone)) standalone.flags |= Notification.FLAG_INSISTENT;
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
                String channel = sbn.getNotification().getChannelId();
                if (CH_MESSAGES.equals(channel) || (channel != null && channel.startsWith("messages_v2_"))) nm.cancel(sbn.getTag(), sbn.getId());
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

    /** WebView ignores <a download> for blob: URLs, so let the user pick where to save via the system file picker. */
    @PluginMethod
    public void saveFile(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(call.getString("mime", "application/octet-stream"));
        i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "onepair-file"));
        startActivityForResult(call, i, "saveFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = result.getData() != null ? result.getData().getData() : null;
        JSObject r = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            r.put("saved", false);
            call.resolve(r);
            return;
        }
        new Thread(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IOException("Cannot open " + uri);
                out.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
                r.put("saved", true);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Could not save file: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void startScreenCapture(PluginCall call) {
        if (screenCall != null || ScreenCaptureService.active || screenStopCall != null) {call.reject("Stop your current screen share first."); return;}
        screenCall = call;
        try {
            MediaProjectionManager manager = getContext().getSystemService(MediaProjectionManager.class);
            startActivityForResult(call, manager.createScreenCaptureIntent(), "screenCaptureConsent");
        } catch (Exception e) {screenCall = null; call.reject("Could not request screen sharing: " + e.getMessage());}
    }
    @ActivityCallback
    private void screenCaptureConsent(PluginCall call, ActivityResult result) {
        if (call == null || screenCall != call) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {screenCall = null; call.reject("Screen sharing permission was cancelled."); return;}
        ScreenCaptureService.listener = new ScreenCaptureService.Listener() {
            @Override public void started(int width, int height) {screenMain.post(() -> {
                if (screenCall != call) {getContext().stopService(new Intent(getContext(), ScreenCaptureService.class)); return;}
                screenCall = null; JSObject data = new JSObject(); data.put("width", width); data.put("height", height); call.resolve(data);
            });}
            @Override public void frame(String jpeg, int width, int height) {
                if (!frameQueued.compareAndSet(false, true)) return;
                screenMain.post(() -> {try {
                    if (instance != OnePairNativePlugin.this || !ScreenCaptureService.running) return;
                    JSObject data = new JSObject(); data.put("data", jpeg); data.put("width", width); data.put("height", height);
                    notifyListeners("screenFrame", data);
                } finally {frameQueued.set(false);}});
            }
            @Override public void stopped(String reason) {screenMain.post(() -> {
                if (screenCall == call) {screenCall = null; call.reject(reason);}
                JSObject data = new JSObject(); data.put("reason", reason); notifyListeners("screenCaptureStopped", data);
                if (screenStopCall != null) {screenStopCall.resolve(); screenStopCall = null;}
            });}
        };
        try {
            Intent intent = new Intent(getContext(), ScreenCaptureService.class).putExtra("consent", result.getData());
            ContextCompat.startForegroundService(getContext(), intent);
        } catch (Exception e) {screenCall = null; ScreenCaptureService.listener = null; call.reject("Could not start screen sharing: " + e.getMessage());}
    }
    @PluginMethod
    public void stopScreenCapture(PluginCall call) {
        if (screenStopCall != null) {call.reject("Screen sharing is already stopping."); return;}
        if (screenCall != null) {screenCall.reject("Screen sharing cancelled."); screenCall = null;}
        screenStopCall = call;
        boolean stopped = getContext().stopService(new Intent(getContext(), ScreenCaptureService.class));
        if (!stopped || !ScreenCaptureService.active) {screenStopCall = null; call.resolve();}
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
