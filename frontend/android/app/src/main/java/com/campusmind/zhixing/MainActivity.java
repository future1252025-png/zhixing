package com.campusmind.zhixing;

import android.os.Bundle;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import com.getcapacitor.BridgeActivity;

import com.campusmind.zhixing.hubu.HubuCourseImportPlugin;
import com.campusmind.zhixing.security.SecureSessionPlugin;
import com.campusmind.zhixing.reminders.ReminderSettingsPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HubuCourseImportPlugin.class);
        registerPlugin(SecureSessionPlugin.class);
        registerPlugin(ReminderSettingsPlugin.class);
        super.onCreate(savedInstanceState);
        createReminderChannels();
    }

    private void createReminderChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        String[] modes = { "sound", "vibrate", "silent" };
        String[] names = { "提醒 · 声音和震动", "提醒 · 仅震动", "提醒 · 静默通知" };
        for (int i = 0; i < modes.length; i++) {
            NotificationChannel channel = new NotificationChannel("campusmind-reminder-" + modes[i] + "-v1", names[i],
                i == 2 ? NotificationManager.IMPORTANCE_LOW : NotificationManager.IMPORTANCE_HIGH);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            channel.enableVibration(i != 2);
            channel.setSound(i == 0 ? RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) : null,
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
            manager.createNotificationChannel(channel);
        }
    }
}
