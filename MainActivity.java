package com.leitortts.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SintesePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
