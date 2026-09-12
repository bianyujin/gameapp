# -*- coding: utf-8 -*-
# 1) 首页：移除轮播 + 加"用户协议/解压密码"两张卡片（游戏合集上面同款样式）
# 2) NotionActivity：顶部返回/刷新栏 + 视口 1600
# 3) 升版 2.47
import io

# ---------- 站点 index.html ----------
p = 'index.html'
s = io.open(p, encoding='utf-8').read()

# 移除轮播容器
old = """                <div id="carousel" style="display:none;margin-bottom:16px;position:relative;border-radius:12px;overflow:hidden;">
                    <div id="carouselSlides" style="position:relative;height:110px;"></div>
                    <div id="carouselDots" style="position:absolute;bottom:8px;left:0;right:0;display:flex;justify-content:center;gap:6px;"></div>
                </div>
"""
assert old in s, '轮播容器'
s = s.replace(old, '')

# 移除轮播 JS（try 块）
i = s.index('        // 轮播图\n')
j = s.index('        } catch (e) { /* 无轮播则隐藏 */ }\n', i) + len('        } catch (e) { /* 无轮播则隐藏 */ }\n')
s = s[:i] + s[j:]

# 两张卡片插到 游戏合集 卡片前
anchor = '                <div onclick="App.switchPage(\'collections\')" style="margin-top:16px;'
assert anchor in s, '游戏合集卡片'
cards = """                <div onclick="App.showUserAgreement()" style="margin-top:16px;background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%);border-radius:12px;padding:16px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 12px rgba(14,165,233,0.3);">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="font-size:28px;">📄</span>
                        <div>
                            <div style="font-weight:600;color:white;font-size:15px;">用户协议</div>
                            <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px;">使用须知与免责声明</div>
                        </div>
                    </div>
                    <span style="color:rgba(255,255,255,0.8);font-size:20px;">›</span>
                </div>
                <div onclick="App.showJieyaMima()" style="margin-top:12px;background:linear-gradient(135deg,#f59e0b 0%,#ef4444 100%);border-radius:12px;padding:16px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 12px rgba(245,158,11,0.3);">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="font-size:28px;">🔑</span>
                        <div>
                            <div style="font-weight:600;color:white;font-size:15px;">解压教程与密码</div>
                            <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px;">解压问题看这里（图很长，慢慢看）</div>
                        </div>
                    </div>
                    <span style="color:rgba(255,255,255,0.8);font-size:20px;">›</span>
                </div>
"""
s = s.replace(anchor, cards + anchor)

# showJieyaMima 函数（加在 showUserAgreement 之后）
anchor2 = "    App.showUserAgreement = function () {"
jieya = """    App.showJieyaMima = function () {
        if (document.getElementById('jieyaModal')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal" id="jieyaModal">
            <div class="modal-backdrop" onclick="document.getElementById('jieyaModal').remove()"></div>
            <div class="modal-content" style="max-width:480px;">
                <div class="modal-header"><h3 class="modal-title">🔑 解压教程与密码</h3></div>
                <div class="modal-body" style="max-height:65vh;overflow:auto;">
                    <img src="jieyamima.jpg" style="width:100%;border-radius:8px;" alt="解压密码说明">
                    <p style="font-size:12px;color:#64748b;text-align:center;">图片较长，上下滑动查看；看不清可长按保存后放大</p>
                </div>
                <div class="modal-footer" style="justify-content:center;">
                    <button class="btn btn-primary" onclick="document.getElementById('jieyaModal').remove()">我知道了</button>
                </div>
            </div>
        </div>`);
    };
"""
assert anchor2 in s, 'showUserAgreement'
s = s.replace(anchor2, jieya + anchor2)
io.open(p, 'w', encoding='utf-8').write(s)
print('index.html OK')

# ---------- NotionActivity ----------
p = r'app/java/dev/pages/gameapp_2e8/twa/NotionActivity.java'
s = io.open(p, encoding='utf-8').read()

old = "                    + \"m.setAttribute('content','width=1280,user-scalable=yes');}catch(e){}\""
assert old in s, '视口'
s = s.replace(old, "                    + \"m.setAttribute('content','width=1600,user-scalable=yes');}catch(e){}\"")

old = '            findViewById(R.id.disclaimer_exit);'  # 不会命中，仅占位
# 顶部栏接线：onCreate 里 setContentView 后
old = '        web = findViewById(R.id.notion_web);\n        bar = findViewById(R.id.notion_progress);'
assert old in s, '接线'
s = s.replace(old, '''        web = findViewById(R.id.notion_web);
        bar = findViewById(R.id.notion_progress);
        findViewById(R.id.notion_back).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        findViewById(R.id.notion_reload).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                web.reload();
                toast("正在重新加载…");
            }
        });''')
io.open(p, 'w', encoding='utf-8').write(s)
print('NotionActivity OK')

# toast 方法确认存在性由编译检查兜底

# ---------- activity_notion.xml 整体重写（带顶部栏） ----------
p = r'app/res/layout/activity_notion.xml'
layout = '''<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@color/bg2"
    android:orientation="vertical">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="44dp"
        android:background="@color/bg2"
        android:gravity="center_vertical"
        android:orientation="horizontal">

        <TextView
            android:id="@+id/notion_back"
            android:layout_width="wrap_content"
            android:layout_height="match_parent"
            android:gravity="center"
            android:paddingLeft="14dp"
            android:paddingRight="14dp"
            android:text="← 返回"
            android:textColor="#A5B4FC"
            android:textSize="14sp" />

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="备用表格"
            android:textColor="@color/text"
            android:textSize="15sp" />

        <TextView
            android:id="@+id/notion_reload"
            android:layout_width="wrap_content"
            android:layout_height="match_parent"
            android:gravity="center"
            android:paddingLeft="14dp"
            android:paddingRight="14dp"
            android:text="↻ 刷新"
            android:textColor="#A5B4FC"
            android:textSize="14sp" />
    </LinearLayout>

    <FrameLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1">

        <WebView
            android:id="@+id/notion_web"
            android:layout_width="match_parent"
            android:layout_height="match_parent" />

        <ProgressBar
            android:id="@+id/notion_progress"
            style="?android:attr/progressBarStyleHorizontal"
            android:layout_width="match_parent"
            android:layout_height="3dp"
            android:layout_gravity="top"
            android:max="100"
            android:progressTint="@color/primary"
            android:progressBackgroundTint="@color/bg"
            android:translationZ="4dp" />
    </FrameLayout>
</LinearLayout>
'''
io.open(p, 'w', encoding='utf-8').write(layout)
print('activity_notion.xml OK')

# ---------- build.py 2.47 ----------
p = 'build.py'
s = io.open(p, encoding='utf-8').read()
s = s.replace('VERSION_CODE = "246"', 'VERSION_CODE = "247"').replace('VERSION_NAME = "2.46"', 'VERSION_NAME = "2.47"')
io.open(p, 'w', encoding='utf-8').write(s)
print('build.py 2.47')
