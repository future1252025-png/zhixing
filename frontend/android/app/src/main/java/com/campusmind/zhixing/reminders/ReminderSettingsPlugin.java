package com.campusmind.zhixing.reminders;

import android.app.ActivityManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Read-only diagnostics; settings are changed only by the user in Android UI. */
@CapacitorPlugin(name = "ReminderSettings")
public class ReminderSettingsPlugin extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        PowerManager power = getContext().getSystemService(PowerManager.class);
        ActivityManager activity = getContext().getSystemService(ActivityManager.class);
        JSObject result = new JSObject();
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("batteryOptimized", Build.VERSION.SDK_INT >= 23 && power != null
            && !power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        result.put("backgroundRestricted", Build.VERSION.SDK_INT >= 28 && activity != null && activity.isBackgroundRestricted());
        call.resolve(result);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String target = call.getString("target", "app");
        if (!target.equals("battery") && !target.equals("app")) {
            call.reject("Unsupported settings target");
            return;
        }
        getActivity().runOnUiThread(() -> {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName()));
            try {
                Intent intent = target.equals("battery")
                    ? new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS) : fallback;
                try { getActivity().startActivity(intent); }
                catch (Exception unavailable) { getActivity().startActivity(fallback); }
                // Do not await a settings result: OEM screens may never return one.
                call.resolve();
            } catch (Exception error) { call.reject("无法打开系统设置，请手动进入智行的应用设置", error); }
        });
    }
}
