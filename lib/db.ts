import path from "path";
import Database from "better-sqlite3";
import assert from "assert";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.env.DB_PATH!);
    db = new Database(dbPath, { readonly: true });
  }
  return db;
}

export interface ForumOption {
  name: string;
}

export function getForumNames(): ForumOption[] {
  const db = getDb();

  const stmt = db.prepare<[], ForumOption>(`
    SELECT
      forum_name as name
    FROM
      forum
  `);

  const row = stmt.all();

  return row;
}

export interface UserInfo {
  uid: number;
  changed_at: number;
  username: string;
  nickname: string;
  portrait: string;
  avatar_small_hash: string;
  avatar_large_hash: string;
}

interface AuthoredRecord {
  created_at: number;
  content: string;
  author_id: number;
  author_name: string | null;
  author_avatar: string | null;
}

export function getUserInfo(uid: number): UserInfo {
  const db = getDb();

  const stmt = db.prepare<[number], UserInfo>(`
    SELECT
      u.uid,
      up.changed_at,
      up.username,
      up.nickname,
      u.portrait,
      i.avatar_small_hash,
      i.avatar_large_hash
    FROM user u
    LEFT JOIN user_profile up
      ON up.id = u.current_profile_id
    LEFT JOIN image i
      ON up.portrait_id = i.id
    WHERE u.uid = ?
  `);

  const row = stmt.get(uid);
  assert(row);

  return row;
}

export interface ThreadRow extends AuthoredRecord {
  id: number;
  title: string;
  updated_at: number;
  forum_id: number;
  forum_name: string;
  view_num: number;
  reply_num: number;
  share_num: number;
  agree: number;
  disagree: number;
}

const THREAD_ROW_SELECT = `
  SELECT
    t.tid AS id,
    t.title,
    t.content,
    t.author_id,
    t.time AS created_at,
    t.updated_time AS updated_at,
    t.forum_id,
    f.forum_name,
    COALESCE(up.nickname, up.username) AS author_name,
    i.avatar_large_hash AS author_avatar,
    t.view_num,
    t.reply_num,
    t.share_num,
    t.agree,
    t.disagree
  FROM thread t
  LEFT JOIN forum f
    ON f.fid = t.forum_id
  LEFT JOIN user u
    ON u.uid = t.author_id
  LEFT JOIN user_profile up
    ON up.id = u.current_profile_id
  LEFT JOIN image i
    ON up.portrait_id = i.id
`;

export function getThreads(
  limit: number,
  forum_name?: string,
  order?: string,
): ThreadRow[] {
  const db = getDb();
  const forumFilter = forum_name?.trim() || "";
  const orderMode = order === "Create" ? "Create" : "Reply";

  if (!forumFilter) {
    const stmt = db.prepare<[string, number], ThreadRow>(`
      ${THREAD_ROW_SELECT}
      ORDER BY
        CASE WHEN ? = 'Create' THEN t.time ELSE t.updated_time END DESC
      LIMIT ?
    `);
    return stmt.all(orderMode, limit);
  }

  const stmt = db.prepare<[string, string, number], ThreadRow>(`
    ${THREAD_ROW_SELECT}
    WHERE f.forum_name = ?
    ORDER BY
      CASE WHEN ? = 'Create' THEN t.time ELSE t.updated_time END DESC
    LIMIT ?
  `);
  return stmt.all(forumFilter, orderMode, limit);
}

export function getUserThreads(uid: number, limit: number): ThreadRow[] {
  const db = getDb();

  const stmt = db.prepare<[number, number], ThreadRow>(`
    ${THREAD_ROW_SELECT}
    WHERE t.author_id = ?
    ORDER BY t.time DESC
    LIMIT ?
  `);

  return stmt.all(uid, limit);
}

export type UserActivityKind = "thread" | "post" | "comment";

interface UserActivityContext extends Pick<
  ThreadRow,
  "created_at" | "author_id" | "forum_name"
> {
  thread_id: ThreadRow["id"];
  thread_title: ThreadRow["title"];
}

export interface UserThreadActivity
  extends
    UserActivityContext,
    Pick<ThreadRow, "reply_num" | "agree" | "disagree"> {
  kind: "thread";
  thread_content: ThreadRow["content"];
}

export interface UserPostActivity extends UserActivityContext {
  kind: "post";
  content: ThreadRow["content"];
  post_id: PostRow["id"];
  floor: PostRow["floor"];
}

export interface UserCommentActivity extends UserActivityContext {
  kind: "comment";
  content: ThreadRow["content"];
  post_id: PostRow["id"];
  comment_id: CommentRow["id"];
  post_floor: PostRow["floor"];
  reply_to_author_name: CommentRow["reply_to_author_name"];
}

export type UserCommentFeedItem = UserPostActivity | UserCommentActivity;

export type UserOverviewItem =
  | UserThreadActivity
  | UserPostActivity
  | UserCommentActivity;

function sortAndLimitByCreatedAt<T extends { created_at: number }>(
  rows: T[],
  limit: number,
): T[] {
  return rows.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}

function queryUserThreadActivities(
  uid: number,
  limit: number,
): UserThreadActivity[] {
  const db = getDb();

  return db
    .prepare<[number, number], UserThreadActivity>(
      `
      SELECT
        'thread' AS kind,
        t.time AS created_at,
        t.author_id AS author_id,
        t.tid AS thread_id,
        t.title AS thread_title,
        f.forum_name AS forum_name,
        t.content AS thread_content,
        t.reply_num AS reply_num,
        t.agree AS agree,
        t.disagree AS disagree
      FROM thread t
      LEFT JOIN forum f
        ON f.fid = t.forum_id
      WHERE t.author_id = ?
      ORDER BY t.time DESC
      LIMIT ?
    `,
    )
    .all(uid, limit);
}

function queryUserPostActivities(
  uid: number,
  limit: number,
): UserPostActivity[] {
  const db = getDb();

  return db
    .prepare<[number, number], UserPostActivity>(
      `
      SELECT
        'post' AS kind,
        p.time AS created_at,
        p.author_id AS author_id,
        t.tid AS thread_id,
        t.title AS thread_title,
        f.forum_name AS forum_name,
        p.content AS content,
        p.pid AS post_id,
        p.floor AS floor
      FROM post p
      JOIN thread t
        ON t.tid = p.tid
      LEFT JOIN forum f
        ON f.fid = t.forum_id
      WHERE p.author_id = ?
      ORDER BY p.time DESC, p.pid DESC
      LIMIT ?
    `,
    )
    .all(uid, limit);
}

function queryUserCommentActivities(
  uid: number,
  limit: number,
): UserCommentActivity[] {
  const db = getDb();

  return db
    .prepare<[number, number], UserCommentActivity>(
      `
      SELECT
        'comment' AS kind,
        c.time AS created_at,
        c.author_id AS author_id,
        t.tid AS thread_id,
        t.title AS thread_title,
        f.forum_name AS forum_name,
        c.content AS content,
        p.pid AS post_id,
        c.cid AS comment_id,
        p.floor AS post_floor,
        COALESCE(up2.nickname, up2.username) AS reply_to_author_name
      FROM comment c
      JOIN post p
        ON p.pid = c.pid
      JOIN thread t
        ON t.tid = p.tid
      LEFT JOIN forum f
        ON f.fid = t.forum_id
      LEFT JOIN user u2
        ON u2.uid = c.reply_to
      LEFT JOIN user_profile up2
        ON up2.id = u2.current_profile_id
       AND c.reply_to <> 0
      WHERE c.author_id = ?
      ORDER BY c.time DESC, c.cid DESC
      LIMIT ?
    `,
    )
    .all(uid, limit);
}

export function getUserPostAndCommentActivities(
  uid: number,
  limit: number,
): UserCommentFeedItem[] {
  const posts = queryUserPostActivities(uid, limit);
  const comments = queryUserCommentActivities(uid, limit);
  return sortAndLimitByCreatedAt([...posts, ...comments], limit);
}

export function getUserOverviewActivities(
  uid: number,
  limit: number,
): UserOverviewItem[] {
  const threads = queryUserThreadActivities(uid, limit);
  const posts = queryUserPostActivities(uid, limit);
  const comments = queryUserCommentActivities(uid, limit);
  return sortAndLimitByCreatedAt([...threads, ...posts, ...comments], limit);
}

export interface PostRow extends AuthoredRecord {
  id: number;
  thread_id: number;
  floor: number;
}

export interface CommentRow extends AuthoredRecord {
  id: number;
  post_id: number;
  reply_to: number;
  reply_to_author_name: string | null;
}

export interface PostWithComments extends PostRow {
  comments: CommentRow[];
}

export interface ThreadChunkData {
  thread: ThreadRow;
  posts: PostWithComments[];
  firstFloor: number | null;
  lastFloor: number | null;
  hasPrev: boolean;
  hasNext: boolean;
}

export type ChunkMode = "start_at" | "after" | "before" | "last";

function getThreadRow(threadId: number): ThreadRow | undefined {
  const db = getDb();

  const threadStmt = db.prepare<[number], ThreadRow>(`
    SELECT
      t.tid                AS id,
      t.title              AS title,
      t.content            AS content,
      t.author_id          AS author_id,
      t.time               AS created_at,
      t.updated_time       AS updated_at,
      t.forum_id           AS forum_id,
      f.forum_name         AS forum_name,
      t.reply_num          AS reply_num,
      COALESCE(up.nickname, up.username) AS author_name,
      i.avatar_large_hash  AS author_avatar
    FROM thread t
    LEFT JOIN forum f
      ON f.fid = t.forum_id
    LEFT JOIN user u
      ON u.uid = t.author_id
    LEFT JOIN user_profile up
      ON up.id = u.current_profile_id
    LEFT JOIN image i
      ON up.portrait_id = i.id
    WHERE t.tid = ?
  `);

  return threadStmt.get(threadId);
}

function getCommentsByPostIds(postIds: number[]): Record<number, CommentRow[]> {
  const db = getDb();

  if (postIds.length === 0) {
    return {};
  }

  const placeholders = postIds.map(() => "?").join(",");

  const commentsStmt = db.prepare<number[], CommentRow>(`
    SELECT
      c.cid               AS id,
      c.pid               AS post_id,
      c.content           AS content,
      c.author_id         AS author_id,
      c.time              AS created_at,
      c.reply_to          AS reply_to,
      COALESCE(up1.nickname, up1.username) AS author_name,
      COALESCE(up2.nickname, up2.username) AS reply_to_author_name,
      i.avatar_large_hash AS author_avatar
    FROM comment c
    LEFT JOIN user u1
      ON u1.uid = c.author_id
    LEFT JOIN user_profile up1
      ON up1.id = u1.current_profile_id
    LEFT JOIN image i
      ON up1.portrait_id = i.id
    LEFT JOIN user u2
      ON u2.uid = c.reply_to
    LEFT JOIN user_profile up2
      ON up2.id = u2.current_profile_id
     AND c.reply_to <> 0
    WHERE c.pid IN (${placeholders})
    ORDER BY c.time ASC, c.cid ASC
  `);

  const comments = commentsStmt.all(...postIds);

  return comments.reduce<Record<number, CommentRow[]>>((acc, comment) => {
    if (!acc[comment.post_id]) {
      acc[comment.post_id] = [];
    }
    acc[comment.post_id].push(comment);
    return acc;
  }, {});
}

function getPostsChunk(
  threadId: number,
  floor: number,
  limit: number,
  mode: ChunkMode,
): PostRow[] {
  const db = getDb();

  const normalizedFloor = Math.max(1, floor);
  const normalizedLimit = Math.max(1, limit);

  if (mode === "last") {
    const postsDesc = db
      .prepare<[number, number], PostRow>(
        `
      SELECT
        p.pid               AS id,
        p.tid               AS thread_id,
        p.content           AS content,
        p.author_id         AS author_id,
        p.time              AS created_at,
        p.floor             AS floor,
        COALESCE(up.nickname, up.username) AS author_name,
        i.avatar_large_hash AS author_avatar
      FROM post p
      LEFT JOIN user u
        ON u.uid = p.author_id
      LEFT JOIN user_profile up
        ON up.id = u.current_profile_id
      LEFT JOIN image i
        ON up.portrait_id = i.id
      WHERE p.tid = ?
      ORDER BY p.floor DESC
      LIMIT ?
    `,
      )
      .all(threadId, normalizedLimit);

    return postsDesc.reverse();
  }

  const whereOp = mode === "start_at" ? ">=" : mode === "after" ? ">" : "<";

  const orderDir = mode === "before" ? "DESC" : "ASC";

  const postsStmt = db.prepare<[number, number, number], PostRow>(`
    SELECT
      p.pid               AS id,
      p.tid               AS thread_id,
      p.content           AS content,
      p.author_id         AS author_id,
      p.time              AS created_at,
      p.floor             AS floor,
      COALESCE(up.nickname, up.username) AS author_name,
      i.avatar_large_hash AS author_avatar
    FROM post p
    LEFT JOIN user u
      ON u.uid = p.author_id
    LEFT JOIN user_profile up
      ON up.id = u.current_profile_id
    LEFT JOIN image i
      ON up.portrait_id = i.id
    WHERE p.tid = ?
      AND p.floor ${whereOp} ?
    ORDER BY p.floor ${orderDir}
    LIMIT ?
  `);

  const rows = postsStmt.all(threadId, normalizedFloor, normalizedLimit);
  return mode === "before" ? rows.reverse() : rows;
}

function hasPostBefore(threadId: number, floor: number): boolean {
  const db = getDb();

  const stmt = db.prepare<[number, number], { has: number }>(`
    SELECT EXISTS(
      SELECT 1
      FROM post p
      WHERE p.tid = ?
        AND p.floor < ?
    ) AS has
  `);

  return stmt.get(threadId, floor)!.has === 1;
}

function hasPostAfter(threadId: number, floor: number): boolean {
  const db = getDb();

  const stmt = db.prepare<[number, number], { has: number }>(`
    SELECT EXISTS(
      SELECT 1
      FROM post p
      WHERE p.tid = ?
        AND p.floor > ?
    ) AS has
  `);

  return stmt.get(threadId, floor)!.has === 1;
}

export function getThreadWithPostsAndCommentsByFloor(
  threadId: number,
  floor: number,
  limit: number = 50,
  mode: ChunkMode = "start_at",
): ThreadChunkData | null {
  const thread = getThreadRow(threadId);
  if (!thread) {
    return null;
  }

  const posts = getPostsChunk(threadId, floor, limit, mode);
  const commentsByPost = getCommentsByPostIds(posts.map((post) => post.id));

  const postsWithComments: PostWithComments[] = posts.map((post) => ({
    ...post,
    comments: commentsByPost[post.id] ?? [],
  }));

  const firstFloor =
    postsWithComments.length > 0 ? postsWithComments[0].floor : null;
  const lastFloor =
    postsWithComments.length > 0
      ? postsWithComments[postsWithComments.length - 1].floor
      : null;

  const hasPrev =
    firstFloor !== null ? hasPostBefore(threadId, firstFloor) : false;
  const hasNext =
    lastFloor !== null ? hasPostAfter(threadId, lastFloor) : false;

  return {
    thread,
    posts: postsWithComments,
    firstFloor,
    lastFloor,
    hasPrev,
    hasNext,
  };
}

export interface ThreadSearchWithCounts extends Pick<
  ThreadRow,
  "id" | "title" | "content" | "created_at" | "forum_name" | "author_name"
> {
  thread_match: boolean;
  post_match_count: number;
  comment_match_count: number;
  post_match_sample_content: string | null;
  comment_match_sample_content: string | null;
}

export function searchThreadsWithKeywordAndScopes(
  keyword: string,
  includePosts: boolean,
  includeComments: boolean,
  forum_name: string,
  limit = 50,
): ThreadSearchWithCounts[] {
  const db = getDb();
  const likeTerm = `%${keyword}%`;

  const threadMatches = new Set<number>();

  // tid -> { count, firstPid }
  const postMatchCounts = new Map<
    number,
    { count: number; firstPid: number }
  >();

  // tid -> { count, firstCid }
  const commentMatchCounts = new Map<
    number,
    { count: number; firstCid: number }
  >();

  const forumFilter = forum_name.trim();

  // 1) Threads where title/content matches

  const threadRows = forumFilter
    ? db
        .prepare<[string, string, string], { tid: number }>(
          `
          SELECT t.tid AS tid
          FROM thread t
          JOIN forum f
            ON t.forum_id = f.fid
          WHERE (t.title LIKE ? OR t.content LIKE ?)
            AND f.forum_name = ?
        `,
        )
        .all(likeTerm, likeTerm, forumFilter)
    : db
        .prepare<[string, string], { tid: number }>(
          `
          SELECT t.tid AS tid
          FROM thread t
          WHERE t.title LIKE ? OR t.content LIKE ?
        `,
        )
        .all(likeTerm, likeTerm);

  for (const row of threadRows) {
    threadMatches.add(row.tid);
  }

  // 2) Posts where content matches (grouped by tid, with first matching pid)
  if (includePosts) {
    const rows = forumFilter
      ? db
          .prepare<
            [string, string],
            { tid: number; cnt: number; first_pid: number }
          >(
            `
            SELECT p.tid AS tid,
                   COUNT(*) AS cnt,
                   MIN(p.pid) AS first_pid
            FROM post p
            JOIN thread t
              ON t.tid = p.tid
            JOIN forum f
              ON t.forum_id = f.fid
            WHERE p.content LIKE ?
              AND f.forum_name = ?
            GROUP BY p.tid
          `,
          )
          .all(likeTerm, forumFilter)
      : db
          .prepare<[string], { tid: number; cnt: number; first_pid: number }>(
            `
            SELECT p.tid AS tid,
                   COUNT(*) AS cnt,
                   MIN(p.pid) AS first_pid
            FROM post p
            WHERE p.content LIKE ?
            GROUP BY p.tid
          `,
          )
          .all(likeTerm);

    for (const r of rows) {
      postMatchCounts.set(r.tid, { count: r.cnt, firstPid: r.first_pid });
    }
  }

  // 3) Comments where content matches (grouped by tid via post, with first cid)
  if (includeComments) {
    const rows = forumFilter
      ? db
          .prepare<
            [string, string],
            { tid: number; cnt: number; first_cid: number }
          >(
            `
            SELECT p.tid AS tid,
                   COUNT(*) AS cnt,
                   MIN(c.cid) AS first_cid
            FROM comment c
            JOIN post p ON p.pid = c.pid
            JOIN thread t
              ON t.tid = p.tid
            JOIN forum f
              ON t.forum_id = f.fid
            WHERE c.content LIKE ?
              AND f.forum_name = ?
            GROUP BY p.tid
          `,
          )
          .all(likeTerm, forumFilter)
      : db
          .prepare<[string], { tid: number; cnt: number; first_cid: number }>(
            `
            SELECT p.tid AS tid,
                   COUNT(*) AS cnt,
                   MIN(c.cid) AS first_cid
            FROM comment c
            JOIN post p ON p.pid = c.pid
            WHERE c.content LIKE ?
            GROUP BY p.tid
          `,
          )
          .all(likeTerm);

    for (const r of rows) {
      commentMatchCounts.set(r.tid, {
        count: r.cnt,
        firstCid: r.first_cid,
      });
    }
  }

  // 4) union of all matching threads (from thread/post/comment)
  const allTids = new Set<number>();
  for (const tid of threadMatches) allTids.add(tid);
  for (const tid of postMatchCounts.keys()) allTids.add(tid);
  for (const tid of commentMatchCounts.keys()) allTids.add(tid);

  if (allTids.size === 0) return [];

  const tidList = Array.from(allTids);
  const tidPlaceholders = tidList.map(() => "?").join(",");

  // 5) Fetch base thread info for all tids
  const baseRows = db
    .prepare<
      number[],
      {
        id: number;
        title: string;
        content: string;
        created_at: number;
        updated_at: number;
        forum_name: string;
        author_name: string | null;
      }
    >(
      `
      SELECT
        t.tid AS id,
        t.title AS title,
        t.content AS content,
        t.time AS created_at,
        t.updated_time AS updated_at,
        f.forum_name AS forum_name,
        COALESCE(up.nickname, up.username) AS author_name
      FROM thread t
      LEFT JOIN forum f
        ON f.fid = t.forum_id
      LEFT JOIN user u
        ON u.uid = t.author_id
      LEFT JOIN user_profile up
        ON up.id = u.current_profile_id
      WHERE t.tid IN (${tidPlaceholders})
    `,
    )
    .all(...tidList);

  // 6) Fetch sample post contents (for firstPid per tid)
  const postSampleContent = new Map<number, string>(); // tid -> content
  if (includePosts && postMatchCounts.size > 0) {
    const firstPids = Array.from(postMatchCounts.values()).map(
      (v) => v.firstPid,
    );
    const placeholders = firstPids.map(() => "?").join(",");
    const rows = db
      .prepare<number[], { pid: number; content: string }>(
        `
        SELECT pid, content
        FROM post
        WHERE pid IN (${placeholders})
      `,
      )
      .all(...firstPids);

    const pidToContent = new Map<number, string>();
    for (const row of rows) {
      pidToContent.set(row.pid, row.content);
    }

    for (const [tid, info] of postMatchCounts.entries()) {
      const c = pidToContent.get(info.firstPid);
      if (c != null) {
        postSampleContent.set(tid, c);
      }
    }
  }

  // 7) Fetch sample comment contents (for firstCid per tid)
  const commentSampleContent = new Map<number, string>(); // tid -> content
  if (includeComments && commentMatchCounts.size > 0) {
    const firstCids = Array.from(commentMatchCounts.values()).map(
      (v) => v.firstCid,
    );
    const placeholders = firstCids.map(() => "?").join(",");
    const rows = db
      .prepare<number[], { cid: number; content: string }>(
        `
        SELECT cid, content
        FROM comment
        WHERE cid IN (${placeholders})
      `,
      )
      .all(...firstCids);

    const cidToContent = new Map<number, string>();
    for (const row of rows) {
      cidToContent.set(row.cid, row.content);
    }

    for (const [tid, info] of commentMatchCounts.entries()) {
      const c = cidToContent.get(info.firstCid);
      if (c != null) {
        commentSampleContent.set(tid, c);
      }
    }
  }

  // 8) Combine everything
  const results: (ThreadSearchWithCounts & { updated_at: number })[] =
    baseRows.map((row) => {
      const postInfo = postMatchCounts.get(row.id);
      const commentInfo = commentMatchCounts.get(row.id);
      return {
        id: row.id,
        title: row.title,
        content: row.content,
        created_at: row.created_at,
        forum_name: row.forum_name,
        author_name: row.author_name,
        thread_match: threadMatches.has(row.id),
        post_match_count: postInfo?.count ?? 0,
        comment_match_count: commentInfo?.count ?? 0,
        post_match_sample_content: postSampleContent.get(row.id) ?? null,
        comment_match_sample_content: commentSampleContent.get(row.id) ?? null,
        updated_at: row.updated_at,
      };
    });

  // 9) Sort by updated_time desc and apply limit
  results.sort((a, b) => b.updated_at - a.updated_at);

  return results.slice(0, limit).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    created_at: row.created_at,
    forum_name: row.forum_name,
    author_name: row.author_name,
    thread_match: row.thread_match,
    post_match_count: row.post_match_count,
    comment_match_count: row.comment_match_count,
    post_match_sample_content: row.post_match_sample_content,
    comment_match_sample_content: row.comment_match_sample_content,
  }));
}
