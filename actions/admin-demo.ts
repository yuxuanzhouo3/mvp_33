'use server';

import { generateDemoBundle, listDemoClientBundles, readDemoManifest } from '@/lib/demo-bundle';
import { requireAdminSession } from '@/lib/admin/session';

export async function generateAdminDemoBundle(clientId?: string | null) {
  await requireAdminSession();

  try {
    const manifest = await generateDemoBundle(clientId);
    return {
      success: true,
      manifest,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to generate demo bundle',
    };
  }
}

export async function getAdminDemoManifest(clientId?: string | null) {
  await requireAdminSession();

  try {
    const manifest = await readDemoManifest(clientId);
    return {
      success: true,
      manifest,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to read demo manifest',
    };
  }
}

export async function listAdminDemoBundles() {
  await requireAdminSession();

  try {
    const bundles = await listDemoClientBundles();
    return {
      success: true,
      bundles,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to read demo client bundles',
    };
  }
}
