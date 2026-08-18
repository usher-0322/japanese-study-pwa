# 日语学习管理器 PWA

这是一个手机优先的日语学习 PWA。默认仍然支持本地缓存和离线使用；配置 Supabase 后，可以用邮箱登录，在手机和电脑之间同步学习数据。

## 已实现

- 每日学习任务，按星期自动生成
- 昨日未完成任务自动顺延
- 工作日顺延任务负荷上限
- 《综合日语》课次与课内环节进度
- 每日新词/复习数量记录
- 本周教材听力、课外听力、精听、跟读统计
- 周末单词测试：日→中、中→日、听音辨词、语境题
- 错词提高后续测试优先级
- 月历、连续学习天数、本周完成率
- 本地数据导出/导入
- PWA 离线缓存与主屏幕安装
- Supabase 登录与多设备同步

## 同步范围

登录后会同步整份学习状态，包括：

- 每日任务完成状态
- 自动顺延后的任务状态
- 《综合日语》教材进度
- 词汇记录和错词本
- 听力时长记录
- 周末单词测试结果
- 设置项

本应用采用轻量方案：Supabase Auth + Postgres + Row Level Security。数据库只建一张 `study_states` 表，每个用户一行，`data` 字段保存完整学习状态 JSON，`updated_at` 用于处理基本冲突。多设备同时修改时，优先保留 `updated_at` 更新的版本。

## 本地预览

PWA 的 Service Worker 不能直接通过 file:// 正常工作，因此请用任意静态服务器。

如果电脑有 Python：

```bash
cd japanese-study-pwa
python -m http.server 8080
```

然后浏览器打开 `http://localhost:8080`。

## 创建 Supabase 项目

1. 打开 https://supabase.com/ 并创建新项目。
2. 进入项目后，打开左侧 **SQL Editor**。
3. 新建 Query，粘贴下面 SQL，点击 **Run**。

```sql
create table if not exists public.study_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.study_states enable row level security;

drop policy if exists "Users can read their own study state" on public.study_states;
create policy "Users can read their own study state"
on public.study_states
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own study state" on public.study_states;
create policy "Users can insert their own study state"
on public.study_states
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own study state" on public.study_states;
create policy "Users can update their own study state"
on public.study_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own study state" on public.study_states;
create policy "Users can delete their own study state"
on public.study_states
for delete
to authenticated
using (auth.uid() = user_id);
```

## 配置 Supabase

1. 在 Supabase 项目中打开 **Project Settings → API**。
2. 复制 **Project URL** 和 **anon public key**。
3. 打开仓库里的 `supabase-config.js`，填入：

```js
window.JP_STUDY_SUPABASE = {
  url: 'https://你的项目.supabase.co',
  anonKey: '你的 anon public key'
};
```

`anon public key` 可以放在前端页面里；真正保护数据的是上面的 RLS 规则。不要把 `service_role` key 放进这个文件。

## 配置登录跳转

如果部署到 GitHub Pages，地址通常是：

```text
https://usher-0322.github.io/japanese-study-pwa/
```

在 Supabase 后台打开 **Authentication → URL Configuration**：

- Site URL：填你的 GitHub Pages 地址
- Redirect URLs：也加入同一个地址

登录方式使用邮箱 Magic Link。第一次在某台设备登录时，会自动处理本机已有 localStorage 数据：

- 云端没有数据：上传本机数据
- 云端已有数据且本机更新：上传本机数据
- 云端已有更新数据：载入云端数据，并在本机留下一个 `jpStudyPreSyncBackup-用户ID` 备份，避免直接丢失旧数据

## 离线与冲突

- 没网时，任务、词汇、听力、测试和设置仍然写入本机 localStorage。
- 恢复联网后，应用会自动尝试同步。
- 多设备冲突采用简单规则：`updated_at` 最新的版本获胜。
- 顶部会显示“本地 / 未登录 / 已同步 / 待同步 / 离线”等状态。

## 数据备份

底部 **备份** 入口仍然保留：

- **导出数据**：下载当前完整学习数据 JSON
- **导入数据**：恢复 JSON 备份，并在登录后排队同步到云端
- **本机备份恢复**：如果首次同步时云端数据覆盖了本机进度，打开“备份”后可恢复同步前自动保存的本机备份

即使开启云同步，也建议在重要阶段继续导出一份备份。

## 如果同步后进度被覆盖

不要删除 PWA、不要清理浏览器网站数据。先打开网页底部 **备份**：

1. 查看是否出现“本机备份”。
2. 点 **预览**，确认里面的课次、词库数量、任务日期是否接近丢失前状态。
3. 点 **恢复**。
4. 恢复后会自动保存，并在登录状态下重新同步到云端。

新版同步会优先保护数据量更多的本机状态，避免云端空进度覆盖已有学习记录。

## 发布到 GitHub Pages

1. 把 `index.html`、`app.js`、`styles.css`、`sw.js`、`manifest.webmanifest`、图标和 `supabase-config.js` 提交到仓库根目录。
2. 进入 GitHub 仓库 **Settings → Pages**。
3. Source 选择 **Deploy from a branch**。
4. Branch 选择 `main`，Folder 选择 `/ (root)`。
5. 保存后等待 GitHub Pages 部署完成。

发布后，在 iPhone Safari 打开网址：

1. 点击“分享”
2. 选择“添加到主屏幕”
3. 之后直接从主屏幕图标打开

电脑端直接访问同一个网址，使用同一邮箱登录即可同步。
