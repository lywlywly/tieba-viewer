import path from "path";
import Database from "better-sqlite3";
import assert from "assert";

type QueryParam = string | number | boolean | null;

const DB_DRIVER = (process.env.DB_DRIVER ?? "sqlite").toLowerCase();
const IS_POSTGRES = DB_DRIVER === "postgres" || DB_DRIVER === "pg";

let sqliteDb: Database.Database | null = null;
let pgPoolPromise: Promise<{
  query: (sql: string, values?: QueryParam[]) => Promise<{ rows: unknown[] }>;
}> | null = null;

function getSqliteDb(): Database.Database {
  if (!sqliteDb) {
    const dbPath = path.join(process.env.DB_PATH!);
    sqliteDb = new Database(dbPath, { readonly: true });
  }
  return sqliteDb;
}

async function getPgPool() {
  if (!pgPoolPromise) {
    pgPoolPromise = (async () => {
      const dynamicImport = new Function("m", "return import(m)") as (
        m: string,
      ) => Promise<{
        Pool: new (...args: unknown[]) => {
          query: (
            sql: string,
            values?: QueryParam[],
          ) => Promise<{ rows: unknown[] }>;
        };
      }>;

      const { Pool } = await dynamicImport("pg");
      const connectionString = process.env.DATABASE_URL;
      assert(
        connectionString,
        "DATABASE_URL is required when DB_DRIVER=postgres",
      );
      return new Pool({ connectionString });
    })();
  }

  return pgPoolPromise;
}

function convertQMarkToPg(sql: string): string {
  let out = "";
  let index = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : "";

    if (inLineComment) {
      out += ch;
      if (ch === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      out += ch;
      if (ch === "*" && next === "/") {
        out += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (ch === "-" && next === "-") {
        out += ch + next;
        i++;
        inLineComment = true;
        continue;
      }
      if (ch === "/" && next === "*") {
        out += ch + next;
        i++;
        inBlockComment = true;
        continue;
      }
    }

    if (!inDoubleQuote && ch === "'") {
      out += ch;
      if (next === "'") {
        out += next;
        i++;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }

    if (!inSingleQuote && ch === '"') {
      out += ch;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && ch === "?") {
      out += `$${index}`;
      index += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

async function queryAll<T>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  if (IS_POSTGRES) {
    const pool = await getPgPool();
    const pgSql = convertQMarkToPg(sql);
    const result = await pool.query(pgSql, params);
    return result.rows as T[];
  }

  const db = getSqliteDb();
  return db.prepare<QueryParam[], T>(sql).all(...params);
}

async function queryOne<T>(
  sql: string,
  params: QueryParam[] = [],
): Promise<T | undefined> {
  if (IS_POSTGRES) {
    const rows = await queryAll<T>(`${sql}\nLIMIT 1`, params);
    return rows[0];
  }

  const db = getSqliteDb();
  return db.prepare<QueryParam[], T>(sql).get(...params);
}

function flagToBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower === "1" || lower === "true" || lower === "t";
  }
  return false;
}

export interface ForumOption {
  name: string;
}

export async function getForumNames(): Promise<ForumOption[]> {
  return queryAll<ForumOption>(`
    SELECT
      forum_name as name
    FROM
      forum
  `);
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

export async function getUserInfo(uid: number): Promise<UserInfo> {
  const row = await queryOne<UserInfo>(
    `
    SELECT
      u.uid,
      up.changed_at,
      up.username,
      up.nickname,
      u.portrait,
      i.avatar_small_hash,
      i.avatar_large_hash
    FROM "user" u
    LEFT JOIN user_profile up
      ON up.id = u.current_profile_id
    LEFT JOIN image i
      ON up.portrait_id = i.id
    WHERE u.uid = ?
  `,
    [uid],
  );

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
  LEFT JOIN "user" u
    ON u.uid = t.author_id
  LEFT JOIN user_profile up
    ON up.id = u.current_profile_id
  LEFT JOIN image i
    ON up.portrait_id = i.id
`;

export async function getThreads(
  limit: number,
  forum_name?: string,
  order?: string,
): Promise<ThreadRow[]> {
  const forumFilter = forum_name?.trim() || "";
  const orderMode = order === "Create" ? "Create" : "Reply";

  if (!forumFilter) {
    return queryAll<ThreadRow>(
      `
      ${THREAD_ROW_SELECT}
      ORDER BY
        CASE WHEN ? = 'Create' THEN t.time ELSE t.updated_time END DESC
      LIMIT ?
    `,
      [orderMode, limit],
    );
  }

  return queryAll<ThreadRow>(
    `
    ${THREAD_ROW_SELECT}
    WHERE f.forum_name = ?
    ORDER BY
      CASE WHEN ? = 'Create' THEN t.time ELSE t.updated_time END DESC
    LIMIT ?
  `,
    [forumFilter, orderMode, limit],
  );
}

export async function getUserThreads(
  uid: number,
  limit: number,
): Promise<ThreadRow[]> {
  return queryAll<ThreadRow>(
    `
    ${THREAD_ROW_SELECT}
    WHERE t.author_id = ?
    ORDER BY t.time DESC
    LIMIT ?
  `,
    [uid, limit],
  );
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

async function queryUserThreadActivities(
  uid: number,
  limit: number,
): Promise<UserThreadActivity[]> {
  return queryAll<UserThreadActivity>(
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
    [uid, limit],
  );
}

async function queryUserPostActivities(
  uid: number,
  limit: number,
): Promise<UserPostActivity[]> {
  return queryAll<UserPostActivity>(
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
    [uid, limit],
  );
}

async function queryUserCommentActivities(
  uid: number,
  limit: number,
): Promise<UserCommentActivity[]> {
  return queryAll<UserCommentActivity>(
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
      LEFT JOIN "user" u2
        ON u2.uid = c.reply_to
      LEFT JOIN user_profile up2
        ON up2.id = u2.current_profile_id
        AND c.reply_to <> 0
      WHERE c.author_id = ?
      ORDER BY c.time DESC, c.cid DESC
      LIMIT ?
    `,
    [uid, limit],
  );
}

export async function getUserPostAndCommentActivities(
  uid: number,
  limit: number,
): Promise<UserCommentFeedItem[]> {
  const [posts, comments] = await Promise.all([
    queryUserPostActivities(uid, limit),
    queryUserCommentActivities(uid, limit),
  ]);

  return sortAndLimitByCreatedAt([...posts, ...comments], limit);
}

export async function getUserOverviewActivities(
  uid: number,
  limit: number,
): Promise<UserOverviewItem[]> {
  const [threads, posts, comments] = await Promise.all([
    queryUserThreadActivities(uid, limit),
    queryUserPostActivities(uid, limit),
    queryUserCommentActivities(uid, limit),
  ]);

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

async function getThreadRow(threadId: number): Promise<ThreadRow | undefined> {
  return queryOne<ThreadRow>(
    `
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
      i.avatar_large_hash  AS author_avatar,
      t.view_num           AS view_num,
      t.share_num          AS share_num,
      t.agree              AS agree,
      t.disagree           AS disagree
    FROM thread t
    LEFT JOIN forum f
      ON f.fid = t.forum_id
    LEFT JOIN "user" u
      ON u.uid = t.author_id
    LEFT JOIN user_profile up
      ON up.id = u.current_profile_id
    LEFT JOIN image i
      ON up.portrait_id = i.id
    WHERE t.tid = ?
  `,
    [threadId],
  );
}

async function getCommentsByPostIds(
  postIds: number[],
): Promise<Record<number, CommentRow[]>> {
  if (postIds.length === 0) {
    return {};
  }

  const placeholders = postIds.map(() => "?").join(",");

  const comments = await queryAll<CommentRow>(
    `
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
    LEFT JOIN "user" u1
      ON u1.uid = c.author_id
    LEFT JOIN user_profile up1
      ON up1.id = u1.current_profile_id
    LEFT JOIN image i
      ON up1.portrait_id = i.id
    LEFT JOIN "user" u2
      ON u2.uid = c.reply_to
    LEFT JOIN user_profile up2
      ON up2.id = u2.current_profile_id
      AND c.reply_to <> 0
    WHERE c.pid IN (${placeholders})
    ORDER BY c.time ASC, c.cid ASC
  `,
    postIds,
  );

  return comments.reduce<Record<number, CommentRow[]>>((acc, comment) => {
    if (!acc[comment.post_id]) {
      acc[comment.post_id] = [];
    }
    acc[comment.post_id].push(comment);
    return acc;
  }, {});
}

async function getPostsChunk(
  threadId: number,
  floor: number,
  limit: number,
  mode: ChunkMode,
): Promise<PostRow[]> {
  const normalizedFloor = Math.max(1, floor);
  const normalizedLimit = Math.max(1, limit);

  if (mode === "last") {
    const postsDesc = await queryAll<PostRow>(
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
      LEFT JOIN "user" u
        ON u.uid = p.author_id
      LEFT JOIN user_profile up
        ON up.id = u.current_profile_id
      LEFT JOIN image i
        ON up.portrait_id = i.id
      WHERE p.tid = ?
      ORDER BY p.floor DESC
      LIMIT ?
    `,
      [threadId, normalizedLimit],
    );

    return postsDesc.reverse();
  }

  const whereOp = mode === "start_at" ? ">=" : mode === "after" ? ">" : "<";
  const orderDir = mode === "before" ? "DESC" : "ASC";

  const rows = await queryAll<PostRow>(
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
    LEFT JOIN "user" u
      ON u.uid = p.author_id
    LEFT JOIN user_profile up
      ON up.id = u.current_profile_id
    LEFT JOIN image i
      ON up.portrait_id = i.id
    WHERE p.tid = ?
      AND p.floor ${whereOp} ?
    ORDER BY p.floor ${orderDir}
    LIMIT ?
  `,
    [threadId, normalizedFloor, normalizedLimit],
  );

  return mode === "before" ? rows.reverse() : rows;
}

async function hasPostBefore(
  threadId: number,
  floor: number,
): Promise<boolean> {
  const row = await queryOne<{ has: unknown }>(
    `
    SELECT CASE WHEN EXISTS(
      SELECT 1
      FROM post p
      WHERE p.tid = ?
        AND p.floor < ?
    ) THEN 1 ELSE 0 END AS has
  `,
    [threadId, floor],
  );

  return flagToBoolean(row?.has);
}

async function hasPostAfter(threadId: number, floor: number): Promise<boolean> {
  const row = await queryOne<{ has: unknown }>(
    `
    SELECT CASE WHEN EXISTS(
      SELECT 1
      FROM post p
      WHERE p.tid = ?
        AND p.floor > ?
    ) THEN 1 ELSE 0 END AS has
  `,
    [threadId, floor],
  );

  return flagToBoolean(row?.has);
}

export async function getThreadWithPostsAndCommentsByFloor(
  threadId: number,
  floor: number,
  limit: number = 50,
  mode: ChunkMode = "start_at",
): Promise<ThreadChunkData | null> {
  const thread = await getThreadRow(threadId);
  if (!thread) {
    return null;
  }

  const posts = await getPostsChunk(threadId, floor, limit, mode);
  const commentsByPost = await getCommentsByPostIds(
    posts.map((post) => post.id),
  );

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
    firstFloor !== null ? await hasPostBefore(threadId, firstFloor) : false;
  const hasNext =
    lastFloor !== null ? await hasPostAfter(threadId, lastFloor) : false;

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

export async function searchThreadsWithKeywordAndScopes(
  keyword: string,
  includePosts: boolean,
  includeComments: boolean,
  forum_name: string,
  limit = 50,
): Promise<ThreadSearchWithCounts[]> {
  const likeTerm = `%${keyword}%`;

  const threadMatches = new Set<number>();

  const postMatchCounts = new Map<
    number,
    { count: number; firstPid: number }
  >();

  const commentMatchCounts = new Map<
    number,
    { count: number; firstCid: number }
  >();

  const forumFilter = forum_name.trim();

  const threadRows = forumFilter
    ? await queryAll<{ tid: number }>(
        `
          SELECT t.tid AS tid
          FROM thread t
          JOIN forum f
            ON t.forum_id = f.fid
          WHERE (t.title LIKE ? OR t.content LIKE ?)
            AND f.forum_name = ?
        `,
        [likeTerm, likeTerm, forumFilter],
      )
    : await queryAll<{ tid: number }>(
        `
          SELECT t.tid AS tid
          FROM thread t
          WHERE t.title LIKE ? OR t.content LIKE ?
        `,
        [likeTerm, likeTerm],
      );

  for (const row of threadRows) {
    threadMatches.add(row.tid);
  }

  if (includePosts) {
    const rows = forumFilter
      ? await queryAll<{ tid: number; cnt: number; first_pid: number }>(
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
          [likeTerm, forumFilter],
        )
      : await queryAll<{ tid: number; cnt: number; first_pid: number }>(
          `
            SELECT p.tid AS tid,
                   COUNT(*) AS cnt,
                   MIN(p.pid) AS first_pid
            FROM post p
            WHERE p.content LIKE ?
            GROUP BY p.tid
          `,
          [likeTerm],
        );

    for (const r of rows) {
      postMatchCounts.set(r.tid, { count: r.cnt, firstPid: r.first_pid });
    }
  }

  if (includeComments) {
    const rows = forumFilter
      ? await queryAll<{ tid: number; cnt: number; first_cid: number }>(
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
          [likeTerm, forumFilter],
        )
      : await queryAll<{ tid: number; cnt: number; first_cid: number }>(
          `
            SELECT p.tid AS tid,
                   COUNT(*) AS cnt,
                   MIN(c.cid) AS first_cid
            FROM comment c
            JOIN post p ON p.pid = c.pid
            WHERE c.content LIKE ?
            GROUP BY p.tid
          `,
          [likeTerm],
        );

    for (const r of rows) {
      commentMatchCounts.set(r.tid, {
        count: r.cnt,
        firstCid: r.first_cid,
      });
    }
  }

  const allTids = new Set<number>();
  for (const tid of threadMatches) allTids.add(tid);
  for (const tid of postMatchCounts.keys()) allTids.add(tid);
  for (const tid of commentMatchCounts.keys()) allTids.add(tid);

  if (allTids.size === 0) return [];

  const tidList = Array.from(allTids);
  const tidPlaceholders = tidList.map(() => "?").join(",");

  const baseRows = await queryAll<{
    id: number;
    title: string;
    content: string;
    created_at: number;
    updated_at: number;
    forum_name: string;
    author_name: string | null;
  }>(
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
      LEFT JOIN "user" u
        ON u.uid = t.author_id
      LEFT JOIN user_profile up
        ON up.id = u.current_profile_id
      WHERE t.tid IN (${tidPlaceholders})
    `,
    tidList,
  );

  const postSampleContent = new Map<number, string>();
  if (includePosts && postMatchCounts.size > 0) {
    const firstPids = Array.from(postMatchCounts.values()).map(
      (v) => v.firstPid,
    );
    const placeholders = firstPids.map(() => "?").join(",");
    const rows = await queryAll<{ pid: number; content: string }>(
      `
        SELECT pid, content
        FROM post
        WHERE pid IN (${placeholders})
      `,
      firstPids,
    );

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

  const commentSampleContent = new Map<number, string>();
  if (includeComments && commentMatchCounts.size > 0) {
    const firstCids = Array.from(commentMatchCounts.values()).map(
      (v) => v.firstCid,
    );
    const placeholders = firstCids.map(() => "?").join(",");
    const rows = await queryAll<{ cid: number; content: string }>(
      `
        SELECT cid, content
        FROM comment
        WHERE cid IN (${placeholders})
      `,
      firstCids,
    );

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
