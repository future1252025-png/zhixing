package com.campusmind.zhixing.security;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String KEY_ALIAS = "campusmind_refresh_token_key_v1";
    private static final String PREFS_NAME = "campusmind_secure_session";
    private static final String PREF_TOKEN = "refresh_token";
    private static final byte[] AAD = "campusmind-refresh-token-v1"
        .getBytes(StandardCharsets.UTF_8);

    @PluginMethod
    public void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.isEmpty()) {
            call.reject("刷新令牌不能为空", "empty_value");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            cipher.updateAAD(AAD);
            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            ByteBuffer packed = ByteBuffer.allocate(4 + iv.length + ciphertext.length);
            packed.putInt(iv.length);
            packed.put(iv);
            packed.put(ciphertext);
            boolean saved = preferences().edit().putString(
                PREF_TOKEN,
                Base64.encodeToString(packed.array(), Base64.NO_WRAP)
            ).commit();
            if (!saved) {
                call.reject("安全保存登录状态失败", "secure_store_failed");
                return;
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("安全保存登录状态失败", "secure_store_failed", error);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String encoded = preferences().getString(PREF_TOKEN, null);
        JSObject result = new JSObject();
        if (encoded == null) {
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
            ByteBuffer buffer = ByteBuffer.wrap(packed);
            int ivLength = buffer.getInt();
            if (ivLength < 12 || ivLength > 32 || buffer.remaining() <= ivLength) {
                throw new IllegalStateException("Invalid encrypted session payload");
            }
            byte[] iv = new byte[ivLength];
            buffer.get(iv);
            byte[] ciphertext = new byte[buffer.remaining()];
            buffer.get(ciphertext);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            cipher.updateAAD(AAD);
            String value = new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
            result.put("value", value);
            call.resolve(result);
        } catch (Exception error) {
            // Preferences can be restored onto a device without the matching
            // Keystore key. Remove the unusable blob and require a fresh login.
            preferences().edit().remove(PREF_TOKEN).commit();
            result.put("value", JSObject.NULL);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        if (preferences().edit().remove(PREF_TOKEN).commit()) {
            call.resolve();
        } else {
            call.reject("清除登录状态失败", "secure_remove_failed");
        }
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null))
                .getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        );
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        );
        return generator.generateKey();
    }
}
