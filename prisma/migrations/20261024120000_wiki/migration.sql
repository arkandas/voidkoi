-- CreateEnum
CREATE TYPE "WikiNodeKind" AS ENUM ('FOLDER', 'PAGE');

-- CreateEnum
CREATE TYPE "WikiVisibility" AS ENUM ('INHERIT', 'PUBLIC', 'PRIVATE', 'PASSWORD');

-- CreateTable
CREATE TABLE "wiki_editors" (
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_editors_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "wiki_nodes" (
    "id" SERIAL NOT NULL,
    "kind" "WikiNodeKind" NOT NULL,
    "parent_id" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "visibility" "WikiVisibility" NOT NULL DEFAULT 'INHERIT',
    "password_hash" TEXT,
    "published_revision_id" INTEGER,
    "draft_title" VARCHAR(200),
    "draft_content" TEXT,
    "draft_version" INTEGER NOT NULL DEFAULT 0,
    "draft_updated_by_id" INTEGER,
    "draft_updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "trash_root_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wiki_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_revisions" (
    "id" SERIAL NOT NULL,
    "page_id" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "message" VARCHAR(300),
    "author_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_redirects" (
    "id" SERIAL NOT NULL,
    "path" VARCHAR(1000) NOT NULL,
    "node_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_images" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "uploaded_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_page_images" (
    "page_id" INTEGER NOT NULL,
    "image_id" INTEGER NOT NULL,

    CONSTRAINT "wiki_page_images_pkey" PRIMARY KEY ("page_id","image_id")
);

-- CreateTable
CREATE TABLE "wiki_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "wiki_name" VARCHAR(60) NOT NULL DEFAULT 'Wiki',
    "home_page_id" INTEGER,
    "root_visibility" "WikiVisibility" NOT NULL DEFAULT 'PRIVATE',
    "root_password_hash" TEXT,
    "allow_indexing" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wiki_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wiki_nodes_published_revision_id_key" ON "wiki_nodes"("published_revision_id");

-- CreateIndex
CREATE INDEX "wiki_nodes_parent_id_position_idx" ON "wiki_nodes"("parent_id", "position");

-- CreateIndex
CREATE INDEX "wiki_nodes_deleted_at_idx" ON "wiki_nodes"("deleted_at");

-- CreateIndex
CREATE INDEX "wiki_nodes_trash_root_id_idx" ON "wiki_nodes"("trash_root_id");

-- CreateIndex
CREATE UNIQUE INDEX "wiki_revisions_page_id_number_key" ON "wiki_revisions"("page_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "wiki_redirects_path_key" ON "wiki_redirects"("path");

-- CreateIndex
CREATE INDEX "wiki_redirects_node_id_idx" ON "wiki_redirects"("node_id");

-- CreateIndex
CREATE UNIQUE INDEX "wiki_images_key_key" ON "wiki_images"("key");

-- CreateIndex
CREATE INDEX "wiki_page_images_image_id_idx" ON "wiki_page_images"("image_id");

-- AddForeignKey
ALTER TABLE "wiki_editors" ADD CONSTRAINT "wiki_editors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_nodes" ADD CONSTRAINT "wiki_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_nodes" ADD CONSTRAINT "wiki_nodes_published_revision_id_fkey" FOREIGN KEY ("published_revision_id") REFERENCES "wiki_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_nodes" ADD CONSTRAINT "wiki_nodes_draft_updated_by_id_fkey" FOREIGN KEY ("draft_updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_revisions" ADD CONSTRAINT "wiki_revisions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_revisions" ADD CONSTRAINT "wiki_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_redirects" ADD CONSTRAINT "wiki_redirects_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_images" ADD CONSTRAINT "wiki_images_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_page_images" ADD CONSTRAINT "wiki_page_images_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_page_images" ADD CONSTRAINT "wiki_page_images_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "wiki_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

