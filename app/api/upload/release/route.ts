import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/session";
import { IS_DOMESTIC_VERSION } from "@/config";
import { CloudBaseConnector } from "@/lib/cloudbase/connector";
import { getSupabaseAdmin } from "@/lib/integrations/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed.replace(/\\+/g, "/");
  const base = normalized.split("/").pop() || trimmed;
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();

    const formData = await request.formData();
    const file = formData.get("file");
    const rawFileName = formData.get("fileName");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const safeName = sanitizeFileName(
      typeof rawFileName === "string" ? rawFileName : file.name
    );
    const fallbackName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${file.name || "release"}`;
    const finalName = safeName || sanitizeFileName(fallbackName) || fallbackName;

    if (IS_DOMESTIC_VERSION) {
      const connector = new CloudBaseConnector();
      await connector.initialize();
      const app = connector.getApp();

      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);
      const cloudPath = `releases/${finalName}`;

      const uploadResult = await app.uploadFile({
        cloudPath,
        fileContent: fileBuffer,
      });

      let fileId: string | undefined = uploadResult?.fileID;
      if (!fileId || !fileId.startsWith("cloud://")) {
        const envId = process.env.CLOUDBASE_ENV_ID;
        fileId = envId ? `cloud://${envId}/${cloudPath}` : cloudPath;
      }

      return NextResponse.json({
        success: true,
        fileID: fileId,
        fileName: finalName,
        fileSize: file.size,
      });
    }

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from("releases")
      .upload(finalName, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Failed to upload file", details: uploadError.message },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("releases")
      .getPublicUrl(finalName);

    return NextResponse.json({
      success: true,
      fileUrl: urlData?.publicUrl || "",
      fileName: finalName,
      fileSize: file.size,
    });
  } catch (error: any) {
    console.error("[UPLOAD RELEASE] error:", error);
    const status = error?.message?.includes("需要管理员权限") ? 401 : 500;
    return NextResponse.json(
      { error: error?.message || "Upload failed" },
      { status }
    );
  }
}
