package app.onepair.p2p;

import android.app.Activity;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.RemoteViews;
import android.widget.ScrollView;
import android.widget.TextView;

/** Private host surface. Game UI and pending intents belong to the bundled OpenPigeon library. */
public class OpenPigeonActivity extends Activity {
    private LinearLayout surface;
    private String token;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        token = getIntent().getStringExtra("token");
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        column.setPadding(pad, pad, pad, pad);
        Button back = new Button(this);
        back.setText("Back to OnePair");
        back.setOnClickListener(v -> finish());
        column.addView(back);
        TextView title = new TextView(this);
        title.setText("OpenPigeon • choose a game");
        title.setTextSize(20);
        column.addView(title);
        ScrollView scroll = new ScrollView(this);
        surface = new LinearLayout(this);
        surface.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(surface);
        column.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(column);
        OpenPigeonPlugin plugin = OpenPigeonPlugin.instance;
        if (plugin == null || !plugin.attach(this, token)) finish();
    }

    void render(RemoteViews views) {
        surface.removeAllViews();
        surface.addView(views.apply(this, surface), new ViewGroup.LayoutParams(-1, -2));
    }

    @Override protected void onDestroy() {
        if (OpenPigeonPlugin.instance != null) OpenPigeonPlugin.instance.detach(this, token, isChangingConfigurations());
        super.onDestroy();
    }
}
