package com.campusmind.zhixing.hubu;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class HubuImportPolicyTest {
    @Test
    public void acceptsOnlyOfficialHubuHttpsPages() {
        assertTrue(HubuImportPolicy.isAllowedUrl("https://jwxt.hubu.edu.cn/jsxsd/"));
        assertTrue(HubuImportPolicy.isAllowedUrl("https://one.hubu.edu.cn/shiro-cas"));
        assertTrue(HubuImportPolicy.isAllowedUrl("https://sso.hubu.edu.cn/login"));

        assertFalse(HubuImportPolicy.isAllowedUrl("http://jwxt.hubu.edu.cn/jsxsd/"));
        assertFalse(HubuImportPolicy.isAllowedUrl("https://hubu.edu.cn/"));
        assertFalse(HubuImportPolicy.isAllowedUrl("https://unknown.hubu.edu.cn/jsxsd/"));
        assertFalse(HubuImportPolicy.isAllowedUrl("https://hubu.edu.cn.evil.example/jsxsd/"));
        assertFalse(HubuImportPolicy.isAllowedUrl("https://hubu.edu.cn@evil.example/jsxsd/"));
        assertFalse(HubuImportPolicy.isAllowedUrl("javascript:alert(1)"));
    }

    @Test
    public void rejectsNonTimetablePagesBeforeCapture() {
        assertTrue(
            HubuImportPolicy.looksLikeTimetable(
                "学期理论课表 星期一 星期二 星期三 星期四 第01-02节 1-16周"
            )
        );
        assertFalse(HubuImportPolicy.looksLikeTimetable("统一身份认证 用户登录"));
        assertFalse(HubuImportPolicy.looksLikeTimetable("星期一 星期二 星期三 校园新闻"));
    }

    @Test
    public void stripsQueriesAndFragmentsFromReturnedSourceUrls() {
        assertTrue(
            HubuImportPolicy.sanitizeSourceUrl(
                "https://jwxt.hubu.edu.cn/jsxsd/xskb/xskb_list.do?ticket=secret#table"
            ).equals("https://jwxt.hubu.edu.cn/jsxsd/xskb/xskb_list.do")
        );
        assertTrue(
            HubuImportPolicy.sanitizeSourceUrl("https://evil.example/?ticket=secret")
                .equals(HubuImportPolicy.START_URL)
        );
    }
}
