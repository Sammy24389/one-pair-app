package app.onepair.p2p;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/**
 * Foreground service that keeps the app process alive (and un-frozen) while it's in the background,
 * so the peer-to-peer connection stays up and messages/calls arrive without any server or push service.
 * During a call it also holds the microphone/camera types so audio keeps flowing if the user leaves the app.
 */
public class KeepAliveService extends Service {
    static final String CHANNEL = "connection";
    static final int ID = 4242;
    static final int CLOSED_ID = 4243;
    static final String EXTRA_CALL_AUDIO = "callAudio";
    static final String EXTRA_CALL_VIDEO = "callVideo";

    static volatile boolean running = false;

    public static void start(Context ctx, boolean callAudio, boolean callVideo) {
        Intent i = new Intent(ctx, KeepAliveService.class);
        i.putExtra(EXTRA_CALL_AUDIO, callAudio);
        i.putExtra(EXTRA_CALL_VIDEO, callVideo);
        ContextCompat.startForegroundService(ctx, i);
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, KeepAliveService.class));
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Background connection", NotificationManager.IMPORTANCE_MIN);
        ch.setDescription("Keeps OnePair reachable so messages and calls arrive while the app is in the background");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private PendingIntent openApp() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 1, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static boolean lastAudio = false;

    /** Replace the service notification with a ringing CallStyle one (stays on screen, Answer/Decline buttons). */
    static boolean showRinging(Context ctx, Notification ringing) {
        if (!running) return false;
        try {
            NotificationManagerCompat.from(ctx).notify(ID, ringing);
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }

    /** Put the normal "reachable" notification back after ringing ends. */
    static void stopRinging(Context ctx) {
        if (!running) return;
        try {
            NotificationManagerCompat.from(ctx).notify(ID, buildIdle(ctx, lastAudio));
        } catch (SecurityException ignored) {
        }
    }

    static Notification buildIdle(Context ctx, boolean audio) {
        ensureChannel(ctx);
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch != null) launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(ctx, 1, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_heart)
            .setColor(0xFFE8577E)
            .setContentTitle(audio ? "OnePair call in progress" : "OnePair is reachable")
            .setContentText(audio ? "Tap to return to your call" : "Listening for messages and calls from your pair")
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(open)
            .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        ensureChannel(this);
        boolean audio = intent != null && intent.getBooleanExtra(EXTRA_CALL_AUDIO, false);
        boolean video = intent != null && intent.getBooleanExtra(EXTRA_CALL_VIDEO, false);
        lastAudio = audio;

        Notification n = buildIdle(this, audio);

        int type = 0;
        if (Build.VERSION.SDK_INT >= 34) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING;
        else if (Build.VERSION.SDK_INT >= 29) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
        if (Build.VERSION.SDK_INT >= 30) {
            if (audio) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            if (video) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
        }
        try {
            ServiceCompat.startForeground(this, ID, n, type);
            running = true;
        } catch (Exception e) {
            // e.g. started from background on Android 12+, or call types without the permission – fall back to the basic type.
            try {
                ServiceCompat.startForeground(this, ID, n, Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING : 0);
                running = true;
            } catch (Exception ignored) {
                stopSelf();
            }
        }
        return START_STICKY;
    }

    /** Swiped away from recents: the web layer is gone, so tell the user they're no longer reachable. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        try {
            Notification n = new NotificationCompat.Builder(this, OnePairNativePlugin.CH_MESSAGES)
                .setSmallIcon(R.drawable.ic_stat_heart)
                .setColor(0xFFE8577E)
                .setContentTitle("OnePair was closed")
                .setContentText("Tap to stay reachable for messages and calls")
                .setAutoCancel(true)
                .setContentIntent(openApp())
                .build();
            NotificationManagerCompat.from(this).notify(CLOSED_ID, n);
        } catch (SecurityException ignored) {
            // notifications not permitted
        }
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
