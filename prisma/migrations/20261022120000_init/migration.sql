-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('FOLDER', 'FILE');

-- CreateEnum
CREATE TYPE "LinkAccess" AS ENUM ('PUBLIC', 'USERS');

-- CreateEnum
CREATE TYPE "StickyNoteColor" AS ENUM ('yellow', 'blue', 'green', 'pink', 'orange', 'purple', 'cyan', 'red', 'lime');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "oidc_sub" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "avatar_key" TEXT,
    "apps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "apps_chosen_at" TIMESTAMP(3),
    "locale" TEXT,
    "quota_custom" BOOLEAN NOT NULL DEFAULT false,
    "quota_bytes" BIGINT,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "shares_seen_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files_items" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "kind" "ItemKind" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_key" VARCHAR(255) NOT NULL,
    "size" BIGINT NOT NULL DEFAULT 0,
    "mime" VARCHAR(255),
    "storage_key" TEXT,
    "has_thumbnail" BOOLEAN NOT NULL DEFAULT false,
    "has_preview" BOOLEAN NOT NULL DEFAULT false,
    "thumbnail_tried" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "trashed_at" TIMESTAMP(3),
    "trash_root_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files_uploads" (
    "id" TEXT NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "name" VARCHAR(255) NOT NULL,
    "size" BIGINT NOT NULL,
    "mime" VARCHAR(255) NOT NULL,
    "chunk_size" INTEGER NOT NULL,
    "received" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "replace" BOOLEAN NOT NULL DEFAULT false,
    "upload_link_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files_share_links" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "access" "LinkAccess" NOT NULL DEFAULT 'PUBLIC',
    "password_hash" TEXT,
    "expires_at" TIMESTAMP(3),
    "max_downloads" INTEGER,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files_upload_links" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "folder_id" INTEGER NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "password_hash" TEXT,
    "expires_at" TIMESTAMP(3),
    "received_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_upload_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files_favorites" (
    "user_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_favorites_pkey" PRIMARY KEY ("user_id","item_id")
);

-- CreateTable
CREATE TABLE "files_shares" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "max_upload_bytes" BIGINT,
    "default_quota_bytes" BIGINT,
    "upload_link_max_bytes" BIGINT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits_weights" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits_calories" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "food_item" VARCHAR(255) NOT NULL,
    "calories" INTEGER NOT NULL,
    "quantity" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "meal_type" VARCHAR(50) NOT NULL DEFAULT 'other',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_calories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits_exercises" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "exercise_name" VARCHAR(255) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "calories_burned" INTEGER NOT NULL DEFAULT 0,
    "exercise_type" VARCHAR(100) NOT NULL DEFAULT 'other',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits_meal_templates" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "calories" INTEGER NOT NULL,
    "default_quantity" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "meal_type" VARCHAR(50) NOT NULL DEFAULT 'other',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_meal_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits_exercise_templates" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "calories" INTEGER NOT NULL DEFAULT 0,
    "exercise_type" VARCHAR(100) NOT NULL DEFAULT 'other',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_exercise_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits_goals" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "target_weight" DECIMAL(5,2),
    "start_weight" DECIMAL(5,2),
    "start_date" DATE,
    "weekly_workouts" INTEGER,
    "weekly_rate" DECIMAL(4,2),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes_notes" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "content" TEXT NOT NULL DEFAULT '',
    "folder" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes_folders" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes_images" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes_settings" (
    "user_id" INTEGER NOT NULL,
    "text_font" TEXT NOT NULL,
    "code_font" TEXT NOT NULL,
    "font_size" INTEGER NOT NULL,

    CONSTRAINT "notes_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "talk_conversations" (
    "id" SERIAL NOT NULL,
    "is_direct" BOOLEAN NOT NULL DEFAULT true,
    "direct_key" TEXT,
    "name" TEXT,
    "owner_id" INTEGER,
    "photo_id" TEXT,
    "photo_type" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talk_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talk_members" (
    "conversation_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "last_read_message_id" INTEGER NOT NULL DEFAULT 0,
    "cleared_before_message_id" INTEGER NOT NULL DEFAULT 0,
    "cleared_before_call_id" INTEGER NOT NULL DEFAULT 0,
    "removed_at" TIMESTAMPTZ(6),
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joined_after_message_id" INTEGER NOT NULL DEFAULT 0,
    "left_at" TIMESTAMPTZ(6),
    "left_after_message_id" INTEGER,

    CONSTRAINT "talk_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "talk_messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" INTEGER,
    "event" TEXT,
    "event_user_id" INTEGER,
    "event_text" TEXT,

    CONSTRAINT "talk_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talk_calls" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "caller_id" INTEGER NOT NULL,
    "callee_id" INTEGER NOT NULL,
    "media" TEXT NOT NULL DEFAULT 'audio',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "outcome" TEXT,
    "callee_seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "talk_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talk_message_hides" (
    "message_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "talk_message_hides_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateTable
CREATE TABLE "talk_call_hides" (
    "call_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "talk_call_hides_pkey" PRIMARY KEY ("call_id","user_id")
);

-- CreateTable
CREATE TABLE "talk_users" (
    "user_id" INTEGER NOT NULL,
    "cleared_before_call_id" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "talk_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "talk_push_keys" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "public_key" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talk_push_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talk_push_subscriptions" (
    "endpoint" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talk_push_subscriptions_pkey" PRIMARY KEY ("endpoint")
);

-- CreateTable
CREATE TABLE "talk_attachments" (
    "id" TEXT NOT NULL,
    "uploader_id" INTEGER NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "message_id" INTEGER,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "is_image" BOOLEAN NOT NULL DEFAULT false,
    "preview_type" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talk_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks_boards" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks_sections" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "board_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks_tasks" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "position" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "section_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks_sticky_notes" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "color" "StickyNoteColor" NOT NULL DEFAULT 'yellow',
    "position_x" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "position_y" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "width" INTEGER NOT NULL DEFAULT 200,
    "height" INTEGER NOT NULL DEFAULT 200,
    "z_index" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_sticky_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks_todos" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "position" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_oidc_sub_key" ON "users"("oidc_sub");

-- CreateIndex
CREATE UNIQUE INDEX "files_items_storage_key_key" ON "files_items"("storage_key");

-- CreateIndex
CREATE INDEX "files_items_owner_id_parent_id_name_key_idx" ON "files_items"("owner_id", "parent_id", "name_key");

-- CreateIndex
CREATE INDEX "files_items_parent_id_idx" ON "files_items"("parent_id");

-- CreateIndex
CREATE INDEX "files_items_owner_id_trashed_at_idx" ON "files_items"("owner_id", "trashed_at");

-- CreateIndex
CREATE INDEX "files_items_trash_root_id_idx" ON "files_items"("trash_root_id");

-- CreateIndex
CREATE INDEX "files_uploads_owner_id_idx" ON "files_uploads"("owner_id");

-- CreateIndex
CREATE INDEX "files_uploads_updated_at_idx" ON "files_uploads"("updated_at");

-- CreateIndex
CREATE INDEX "files_uploads_upload_link_id_idx" ON "files_uploads"("upload_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_share_links_token_key" ON "files_share_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "files_share_links_item_id_key" ON "files_share_links"("item_id");

-- CreateIndex
CREATE INDEX "files_share_links_owner_id_idx" ON "files_share_links"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_upload_links_token_key" ON "files_upload_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "files_upload_links_folder_id_key" ON "files_upload_links"("folder_id");

-- CreateIndex
CREATE INDEX "files_upload_links_owner_id_idx" ON "files_upload_links"("owner_id");

-- CreateIndex
CREATE INDEX "files_favorites_item_id_idx" ON "files_favorites"("item_id");

-- CreateIndex
CREATE INDEX "files_shares_user_id_idx" ON "files_shares"("user_id");

-- CreateIndex
CREATE INDEX "files_shares_owner_id_idx" ON "files_shares"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_shares_item_id_user_id_key" ON "files_shares"("item_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "habits_weights_user_id_date_key" ON "habits_weights"("user_id", "date");

-- CreateIndex
CREATE INDEX "habits_calories_user_id_date_idx" ON "habits_calories"("user_id", "date");

-- CreateIndex
CREATE INDEX "habits_exercises_user_id_date_idx" ON "habits_exercises"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "habits_meal_templates_user_id_name_key" ON "habits_meal_templates"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "habits_exercise_templates_user_id_name_key" ON "habits_exercise_templates"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "habits_goals_user_id_key" ON "habits_goals"("user_id");

-- CreateIndex
CREATE INDEX "notes_notes_user_id_idx" ON "notes_notes"("user_id");

-- CreateIndex
CREATE INDEX "notes_folders_user_id_idx" ON "notes_folders"("user_id");

-- CreateIndex
CREATE INDEX "notes_images_user_id_idx" ON "notes_images"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "talk_conversations_direct_key_key" ON "talk_conversations"("direct_key");

-- CreateIndex
CREATE INDEX "talk_members_user_id_idx" ON "talk_members"("user_id");

-- CreateIndex
CREATE INDEX "talk_messages_conversation_id_created_at_id_idx" ON "talk_messages"("conversation_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "talk_calls_conversation_id_started_at_id_idx" ON "talk_calls"("conversation_id", "started_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "talk_calls_caller_id_started_at_id_idx" ON "talk_calls"("caller_id", "started_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "talk_calls_callee_id_started_at_id_idx" ON "talk_calls"("callee_id", "started_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "talk_message_hides_user_id_idx" ON "talk_message_hides"("user_id");

-- CreateIndex
CREATE INDEX "talk_call_hides_user_id_idx" ON "talk_call_hides"("user_id");

-- CreateIndex
CREATE INDEX "talk_push_subscriptions_user_id_idx" ON "talk_push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "talk_attachments_message_id_key" ON "talk_attachments"("message_id");

-- CreateIndex
CREATE INDEX "talk_attachments_conversation_id_created_at_id_idx" ON "talk_attachments"("conversation_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "talk_attachments_created_at_idx" ON "talk_attachments"("created_at");

-- CreateIndex
CREATE INDEX "talk_attachments_uploader_id_idx" ON "talk_attachments"("uploader_id");

-- CreateIndex
CREATE INDEX "tasks_boards_user_id_idx" ON "tasks_boards"("user_id");

-- CreateIndex
CREATE INDEX "tasks_sections_board_id_idx" ON "tasks_sections"("board_id");

-- CreateIndex
CREATE INDEX "tasks_tasks_section_id_idx" ON "tasks_tasks"("section_id");

-- CreateIndex
CREATE INDEX "tasks_sticky_notes_user_id_idx" ON "tasks_sticky_notes"("user_id");

-- CreateIndex
CREATE INDEX "tasks_todos_user_id_idx" ON "tasks_todos"("user_id");

-- AddForeignKey
ALTER TABLE "files_items" ADD CONSTRAINT "files_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_items" ADD CONSTRAINT "files_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "files_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_uploads" ADD CONSTRAINT "files_uploads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_uploads" ADD CONSTRAINT "files_uploads_upload_link_id_fkey" FOREIGN KEY ("upload_link_id") REFERENCES "files_upload_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_share_links" ADD CONSTRAINT "files_share_links_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "files_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_share_links" ADD CONSTRAINT "files_share_links_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_upload_links" ADD CONSTRAINT "files_upload_links_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "files_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_upload_links" ADD CONSTRAINT "files_upload_links_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_favorites" ADD CONSTRAINT "files_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_favorites" ADD CONSTRAINT "files_favorites_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "files_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_shares" ADD CONSTRAINT "files_shares_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "files_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_shares" ADD CONSTRAINT "files_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files_shares" ADD CONSTRAINT "files_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits_weights" ADD CONSTRAINT "habits_weights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits_calories" ADD CONSTRAINT "habits_calories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits_exercises" ADD CONSTRAINT "habits_exercises_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits_meal_templates" ADD CONSTRAINT "habits_meal_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits_exercise_templates" ADD CONSTRAINT "habits_exercise_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits_goals" ADD CONSTRAINT "habits_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes_notes" ADD CONSTRAINT "notes_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes_folders" ADD CONSTRAINT "notes_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes_images" ADD CONSTRAINT "notes_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes_settings" ADD CONSTRAINT "notes_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_conversations" ADD CONSTRAINT "talk_conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_members" ADD CONSTRAINT "talk_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "talk_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_members" ADD CONSTRAINT "talk_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_messages" ADD CONSTRAINT "talk_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "talk_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_messages" ADD CONSTRAINT "talk_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_messages" ADD CONSTRAINT "talk_messages_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_messages" ADD CONSTRAINT "talk_messages_event_user_id_fkey" FOREIGN KEY ("event_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_calls" ADD CONSTRAINT "talk_calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "talk_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_calls" ADD CONSTRAINT "talk_calls_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_calls" ADD CONSTRAINT "talk_calls_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_message_hides" ADD CONSTRAINT "talk_message_hides_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "talk_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_message_hides" ADD CONSTRAINT "talk_message_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_call_hides" ADD CONSTRAINT "talk_call_hides_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "talk_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_call_hides" ADD CONSTRAINT "talk_call_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_users" ADD CONSTRAINT "talk_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_push_subscriptions" ADD CONSTRAINT "talk_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_attachments" ADD CONSTRAINT "talk_attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_attachments" ADD CONSTRAINT "talk_attachments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "talk_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talk_attachments" ADD CONSTRAINT "talk_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "talk_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_boards" ADD CONSTRAINT "tasks_boards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_sections" ADD CONSTRAINT "tasks_sections_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "tasks_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_tasks" ADD CONSTRAINT "tasks_tasks_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "tasks_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_sticky_notes" ADD CONSTRAINT "tasks_sticky_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_todos" ADD CONSTRAINT "tasks_todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the Prisma schema can't state, kept by the database: Talk's.
ALTER TABLE "talk_conversations"
  ADD CONSTRAINT "talk_conversations_direct_key_ck" CHECK (("is_direct" AND "direct_key" IS NOT NULL) OR (NOT "is_direct" AND "direct_key" IS NULL)),
  ADD CONSTRAINT "talk_conversations_group_name_ck" CHECK ("is_direct" OR "name" IS NOT NULL),
  ADD CONSTRAINT "talk_conversations_photo_ck" CHECK (("photo_id" IS NULL) = ("photo_type" IS NULL));

ALTER TABLE "talk_members"
  ADD CONSTRAINT "talk_members_left_ck" CHECK (("left_at" IS NULL) = ("left_after_message_id" IS NULL));

-- Who deleted a message goes when their account does; the message stays deleted.
ALTER TABLE "talk_messages"
  ADD CONSTRAINT "talk_messages_deleted_by_ck" CHECK ("deleted_at" IS NOT NULL OR "deleted_by" IS NULL),
  ADD CONSTRAINT "talk_messages_deleted_body_ck" CHECK ("deleted_at" IS NULL OR "body" = ''),
  ADD CONSTRAINT "talk_messages_event_ck" CHECK ("event" IS NULL OR "event" IN ('created', 'added', 'removed', 'left', 'renamed', 'owner', 'photo'));

ALTER TABLE "talk_calls"
  ADD CONSTRAINT "talk_calls_outcome_ck" CHECK ("outcome" IS NULL OR "outcome" IN ('answered', 'no_answer', 'declined', 'cancelled', 'busy', 'failed')),
  ADD CONSTRAINT "talk_calls_answered_ck" CHECK ("outcome" IS DISTINCT FROM 'answered' OR "answered_at" IS NOT NULL),
  ADD CONSTRAINT "talk_calls_not_self_ck" CHECK ("caller_id" <> "callee_id"),
  ADD CONSTRAINT "talk_calls_media_ck" CHECK ("media" IN ('audio', 'video'));

ALTER TABLE "talk_attachments"
  ADD CONSTRAINT "talk_attachments_size_ck" CHECK ("size_bytes" >= 0),
  ADD CONSTRAINT "talk_attachments_dimensions_ck" CHECK (("width" IS NULL) = ("height" IS NULL));

ALTER TABLE "talk_push_keys"
  ADD CONSTRAINT "talk_push_keys_single_row_ck" CHECK ("id" = 1);
