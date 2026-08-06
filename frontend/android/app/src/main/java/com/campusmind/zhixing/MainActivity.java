package com.campusmind.zhixing;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import com.campusmind.zhixing.hubu.HubuCourseImportPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HubuCourseImportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
