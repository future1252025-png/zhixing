package com.campusmind.zhixing.hubu;

import android.app.Activity;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "HubuCourseImport")
public class HubuCourseImportPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String requestedUrl = call.getString("url", HubuImportPolicy.START_URL);
        if (!HubuImportPolicy.isAllowedUrl(requestedUrl)) {
            call.reject("只允许打开湖北大学官方 HTTPS 页面", "untrusted_url");
            return;
        }

        Intent intent = new Intent(getContext(), HubuCourseImportActivity.class);
        intent.putExtra(HubuCourseImportActivity.EXTRA_START_URL, requestedUrl);
        startActivityForResult(call, intent, "handleImportResult");
    }

    @ActivityCallback
    private void handleImportResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            call.reject("教务系统没有返回课表内容", "empty_capture");
            return;
        }

        String capturedFilePath = data.getStringExtra(HubuCourseImportActivity.EXTRA_CAPTURE_FILE);
        File captureFile = validatedCaptureFile(capturedFilePath);
        if (captureFile == null) {
            call.reject("课表临时文件无效", "invalid_capture_file");
            return;
        }

        try {
            byte[] content = readCaptureFile(captureFile);
            if (content.length == 0 || content.length > HubuImportPolicy.MAX_CAPTURE_BYTES) {
                call.reject("课表页面内容为空或超过 5MB", "capture_size_invalid");
                return;
            }

            JSObject value = new JSObject();
            value.put("cancelled", false);
            value.put("filename", data.getStringExtra(HubuCourseImportActivity.EXTRA_FILENAME));
            value.put("sourceUrl", data.getStringExtra(HubuCourseImportActivity.EXTRA_SOURCE_URL));
            value.put("pageTitle", data.getStringExtra(HubuCourseImportActivity.EXTRA_PAGE_TITLE));
            value.put("html", new String(content, StandardCharsets.UTF_8));
            call.resolve(value);
        } catch (IOException error) {
            call.reject("读取课表临时文件失败", "capture_read_failed", error);
        } finally {
            captureFile.delete();
        }
    }

    private File validatedCaptureFile(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        try {
            File captureRoot = new File(getContext().getCacheDir(), HubuCourseImportActivity.CACHE_DIRECTORY)
                .getCanonicalFile();
            File file = new File(value).getCanonicalFile();
            String rootPath = captureRoot.getPath() + File.separator;
            if (
                !file.getPath().startsWith(rootPath) ||
                !file.isFile() ||
                !file.canRead()
            ) {
                return null;
            }
            return file;
        } catch (IOException error) {
            return null;
        }
    }

    private byte[] readCaptureFile(File file) throws IOException {
        try (
            FileInputStream input = new FileInputStream(file);
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[8192];
            int read;
            int total = 0;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > HubuImportPolicy.MAX_CAPTURE_BYTES) {
                    throw new IOException("Capture exceeds maximum size");
                }
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }
}
