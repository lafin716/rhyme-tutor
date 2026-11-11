/**
 * Ordered, append-only SQL migrations (leader-owned contract).
 * NEVER edit a shipped migration; add a new one. Applied inside a transaction each, tracked in schema_migrations.
 */
export interface Migration {
  version: number
  name: string
  sql: string
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: /* sql */ `
CREATE TABLE user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  answers_json TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  topic_prompt TEXT NOT NULL,
  goal TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
  pace TEXT NOT NULL CHECK (pace IN ('slow','normal','fast')),
  curriculum_status TEXT NOT NULL DEFAULT 'pending' CHECK (curriculum_status IN ('pending','generating','ready','failed')),
  curriculum_error TEXT,
  current_lesson_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_studied_at TEXT
);

-- Course identity is immutable at the DB boundary (defense in depth; repository also rejects).
CREATE TRIGGER courses_immutable_identity
BEFORE UPDATE OF id, request_id, title, topic_prompt, created_at ON courses
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id
  OR NEW.request_id IS NOT OLD.request_id
  OR NEW.title IS NOT OLD.title
  OR NEW.topic_prompt IS NOT OLD.topic_prompt
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'COURSE_IMMUTABLE');
END;

CREATE TABLE tutor_characters (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
  preset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  archetype TEXT NOT NULL,
  personality TEXT NOT NULL,
  speaking_style TEXT NOT NULL,
  teaching_style TEXT NOT NULL,
  expertise TEXT NOT NULL,
  approach TEXT NOT NULL,
  appearance TEXT NOT NULL,
  default_emotion TEXT NOT NULL,
  voice_json TEXT,
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE curriculum_modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  UNIQUE (course_id, position)
);

CREATE TABLE curriculum_lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES curriculum_modules(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','needs_review')),
  started_at TEXT,
  completed_at TEXT,
  UNIQUE (module_id, position)
);
CREATE INDEX idx_lessons_course ON curriculum_lessons(course_id);

CREATE TABLE learning_objectives (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES curriculum_lessons(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','achieved','needs_review')),
  UNIQUE (lesson_id, position)
);
CREATE INDEX idx_objectives_course ON learning_objectives(course_id);

-- Every objective status change to achieved/needs_review must be backed by evidence.
CREATE TABLE objective_evidence (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES learning_objectives(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('quiz','self_report')),
  ref_id TEXT,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_evidence_objective ON objective_evidence(objective_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('tutor','learner','system')),
  kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat','notice')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete','streaming','error','cancelled')),
  client_message_id TEXT,
  reply_to TEXT,
  provider_id TEXT,
  error_code TEXT,
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (course_id, client_message_id),
  UNIQUE (course_id, seq)
);
CREATE INDEX idx_messages_course_seq ON messages(course_id, seq);

CREATE TABLE quizzes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES curriculum_lessons(id) ON DELETE CASCADE,
  objective_id TEXT REFERENCES learning_objectives(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('multiple_choice','ox')),
  question TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  answer_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  flag_reason TEXT,
  provider_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_quizzes_lesson ON quizzes(lesson_id);

CREATE TABLE quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  selected_index INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attempts_quiz ON quiz_attempts(quiz_id);

CREATE TABLE learning_summaries (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id TEXT,
  summary TEXT NOT NULL,
  next_steps TEXT NOT NULL,
  covered_until_message_id TEXT,
  covered_until_seq INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_summaries_course ON learning_summaries(course_id, created_at);

CREATE TABLE learning_memories (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('strength','difficulty','note')),
  content TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('evidence','ai_inferred')),
  source TEXT NOT NULL CHECK (source IN ('summary','quiz')),
  source_ref TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_memories_course ON learning_memories(course_id, created_at);

CREATE TABLE background_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('curriculum_generation','session_summary')),
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  dedupe_key TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX idx_jobs_status ON background_jobs(status, priority DESC, created_at);
-- At most one ACTIVE job per dedupe key (partial unique index).
CREATE UNIQUE INDEX uq_jobs_active_dedupe ON background_jobs(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');
`
  }
]
