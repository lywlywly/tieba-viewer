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

export interface ThreadRow {
  id: number;
  title: string;
  content: string;
  author_id: number;
  created_at: number;
  updated_at: number;
  forum_id: number;
  forum_name: string;
  author_name: string | null;
  author_avatar: string | null;
  view_num: number;
  reply_num: number;
  share_num: number;
  agree: number;
  disagree: number;
}

export function getThreads(
  limit: number,
  forum_name?: string,
  order?: string,
): ThreadRow[] {
  const db = getDb();

  const joinClause = forum_name ? `AND f.forum_name = '${forum_name}'` : "";

  const threadOrder = order === "Create" ? "created_at" : "updated_at";

  const stmt = db.prepare<[number], ThreadRow>(`
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
    JOIN forum f
      ON f.fid = t.forum_id ${joinClause}
    LEFT JOIN user u
      ON u.uid = t.author_id
    LEFT JOIN user_profile up
      ON up.id = u.current_profile_id
    LEFT JOIN image i
      ON up.portrait_id = i.id
    ORDER BY ${threadOrder} DESC
    LIMIT ?
  `);

  return stmt.all(limit);
}

export function getUserThreads(uid: number, limit: number): ThreadRow[] {
  const db = getDb();

  const stmt = db.prepare<[number, number], ThreadRow>(`
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
    WHERE t.author_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return stmt.all(uid, limit);
}

export interface PostRow {
  id: number;
  thread_id: number;
  content: string;
  author_id: number;
  created_at: number;
  floor: number;
  author_name: string | null;
  author_avatar: string | null;
}

export interface CommentRow {
  id: number;
  post_id: number;
  content: string;
  author_id: number;
  created_at: number;
  reply_to: number;
  reply_to_author_name: string | null;
  author_name: string | null;
  author_avatar: string | null;
}

export interface PostWithComments extends PostRow {
  comments: CommentRow[];
}

export interface ThreadData {
  thread: ThreadRow;
  posts: PostWithComments[];
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

export function getThreadWithPostsAndCommentsForward(
  threadId: number,
  floor: number,
  limit: number = 50,
): ThreadChunkData | null {
  return getThreadWithPostsAndCommentsByFloor(threadId, floor, limit, "after");
}

export function getThreadWithPostsAndCommentsBackward(
  threadId: number,
  floor: number,
  limit: number = 50,
): ThreadChunkData | null {
  return getThreadWithPostsAndCommentsByFloor(threadId, floor, limit, "before");
}

export interface ThreadSearchResult {
  id: number; // thread.tid
  title: string;
  content: string;
  created_at: number;
  forum_name: string;
  author_name: string | null;
}

export function searchThreadsByKeyword(
  keyword: string,
  limit = 50,
): ThreadSearchResult[] {
  const db = getDb();
  const term = `%${keyword}%`;

  const stmt = db.prepare<[string, string, number], ThreadSearchResult>(`
    SELECT
      t.tid AS id,
      t.title AS title,
      t.content AS content,
      t.time AS created_at,
      f.forum_name AS forum_name,
      COALESCE(up.nickname, up.username) AS author_name
    FROM thread t
    LEFT JOIN forum f
      ON f.fid = t.forum_id
    LEFT JOIN user u
      ON u.uid = t.author_id
    LEFT JOIN user_profile up
      ON up.id = u.current_profile_id
    WHERE t.title LIKE ? OR t.content LIKE ?
    ORDER BY t.updated_time DESC
    LIMIT ?
  `);

  return stmt.all(term, term, limit);
}

export interface ThreadSearchWithCounts {
  id: number; // thread.tid
  title: string;
  content: string;
  created_at: number;
  forum_name: string;
  author_name: string | null;

  thread_match: boolean;
  post_match_count: number;
  comment_match_count: number;

  // NEW: sample content from first matching post/comment in this thread
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

  // 1) Threads where title/content matches
  let joinClause = forum_name
    ? `JOIN forum f ON t.forum_id = f.fid AND f.forum_name = '${forum_name}'`
    : "";

  const threadRows = db
    .prepare<[string, string], { tid: number }>(
      `
      SELECT t.tid AS tid
      FROM thread t
      ${joinClause}
      WHERE t.title LIKE ? OR t.content LIKE ?
    `,
    )
    .all(likeTerm, likeTerm);

  for (const row of threadRows) {
    threadMatches.add(row.tid);
  }

  // 2) Posts where content matches (grouped by tid, with first matching pid)
  if (includePosts) {
    joinClause = forum_name
      ? `JOIN thread t on t.tid = p.tid JOIN forum f ON t.forum_id = f.fid AND f.forum_name = '${forum_name}'`
      : "";

    const rows = db
      .prepare<[string], { tid: number; cnt: number; first_pid: number }>(
        `
        SELECT p.tid AS tid,
               COUNT(*) AS cnt,
               MIN(p.pid) AS first_pid
        FROM post p
        ${joinClause}
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
    joinClause = forum_name
      ? `JOIN thread t on t.tid = p.tid JOIN forum f ON t.forum_id = f.fid AND f.forum_name = '${forum_name}'`
      : "";

    const rows = db
      .prepare<[string], { tid: number; cnt: number; first_cid: number }>(
        `
        SELECT p.tid AS tid,
               COUNT(*) AS cnt,
               MIN(c.cid) AS first_cid
        FROM comment c
        JOIN post p ON p.pid = c.pid
        ${joinClause}
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

  return results.slice(0, limit).map(({ updated_at, ...rest }) => rest);
}
