import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/session";
import { IS_DOMESTIC_VERSION } from "@/config";
import { CloudBaseConnector } from "@/lib/cloudbase/connector";
import { getSupabaseAdmin } from "@/lib/integrations/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

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
    console.log("[UPLOAD RELEASE] Incoming request", {
      method: request.method,
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
      userAgent: request.headers.get("user-agent"),
    });

    try {
      await requireAdminSession();
    } catch (authError) {
      console.error("[UPLOAD RELEASE] Admin auth failed:", authError);
      return NextResponse.json(
        {
          error: authError instanceof Error ? authError.message : "未授权访问",
        },
        { status: 401 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formError: any) {
      console.error("[UPLOAD RELEASE] FormData parse failed:", {
        message: formError?.message,
        stack: formError?.stack,
      });
      return NextResponse.json(
        {
          error: "FormData 解析失败",
          details: formError?.message || "Failed to parse body as FormData",
        },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    const rawFileName = formData.get("fileName");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `文件太大，最大支持 ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB` },
        { status: 413 }
      );
    }

    console.log("[UPLOAD RELEASE] File info:", {
      name: file.name,
      size: file.size,
      type: file.type,
      rawFileName,
    });

    const safeName = sanitizeFileName(
      typeof rawFileName === "string" ? rawFileName : file.name
    );
    const fallbackName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${file.name || "release"}`;
    const finalName = safeName || sanitizeFileName(fallbackName) || fallbackName;

    if (IS_DOMESTIC_VERSION) {
      console.log("[UPLOAD RELEASE] Using CloudBase Storage", { finalName });
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

      console.log("[UPLOAD RELEASE] CloudBase upload success:", {
        cloudPath,
        fileId,
      });

      return NextResponse.json({
        success: true,
        fileID: fileId,
        fileName: finalName,
        fileSize: file.size,
      });
    }

    console.log("[UPLOAD RELEASE] Using Supabase Storage", { finalName });
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

    console.log("[UPLOAD RELEASE] Supabase upload success:", {
      publicUrl: urlData?.publicUrl,
    });

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







