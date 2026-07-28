package com.campusmind.zhixing.hubu;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public final class HubuImportPolicy {
    public static final String START_URL = "https://jwxt.hubu.edu.cn/jsxsd/";
    public static final int MAX_CAPTURE_BYTES = 5 * 1024 * 1024;

    private static final String OFFICIAL_DOMAIN = "hubu.edu.cn";
    private static final String[] WEEKDAYS = {
        "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日", "星期天"
    };

    private HubuImportPolicy() {}

    public static boolean isAllowedUrl(String value) {
        if (value == null || value.trim().isEmpty()) {
            return false;
        }
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            int port = uri.getPort();
            if (
                scheme == null ||
                !scheme.equalsIgnoreCase("https") ||
                host == null ||
                uri.getUserInfo() != null ||
                (port != -1 && port != 443)
            ) {
                return false;
            }
            String normalizedHost = host.toLowerCase(Locale.ROOT);
            return normalizedHost.equals(OFFICIAL_DOMAIN) ||
                normalizedHost.endsWith("." + OFFICIAL_DOMAIN);
        } catch (URISyntaxException error) {
            return false;
        }
    }

    public static String sanitizeSourceUrl(String value) {
        if (!isAllowedUrl(value)) {
            return START_URL;
        }
        try {
            URI uri = new URI(value);
            String path = uri.getPath();
            return new URI(
                "https",
                null,
                uri.getHost().toLowerCase(Locale.ROOT),
                uri.getPort(),
                path == null || path.isEmpty() ? "/" : path,
                null,
                null
            ).toASCIIString();
        } catch (URISyntaxException error) {
            return START_URL;
        }
    }

    public static boolean looksLikeTimetable(String text) {
        if (text == null || text.trim().isEmpty()) {
            return false;
        }
        Set<String> matchedWeekdays = new HashSet<>();
        for (String weekday : WEEKDAYS) {
            if (text.contains(weekday)) {
                matchedWeekdays.add(weekday.equals("星期天") ? "星期日" : weekday);
            }
        }
        boolean hasTimeLanguage = text.contains("周") || text.contains("节");
        return matchedWeekdays.size() >= 3 && hasTimeLanguage;
    }
}
