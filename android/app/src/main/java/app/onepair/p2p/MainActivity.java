package app.onepair.p2p;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OnePairNativePlugin.class);
        super.onCreate(savedInstanceState);
        OnePairNativePlugin.handleIntent(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        OnePairNativePlugin.handleIntent(this, intent);
    }
}
