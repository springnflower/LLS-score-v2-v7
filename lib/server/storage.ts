import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'storage', 'uploads');

/**
 * 업로드된 엑셀 파일을 저장하고 경로를 반환합니다.
 * 로컬: storage/uploads/ 에 저장. Vercel 등 읽기 전용 환경에서는 저장하지 않고 null 반환.
 */
export async function persistUploadedWorkbook(
  fileName: string,
  buffer: Uint8Array
): Promise<{ storagePath: string | null }> {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}-${(fileName || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = join(UPLOAD_DIR, safeName);
    await writeFile(filePath, buffer);
    return { storagePath: filePath };
  } catch {
    return { storagePath: null };
  }
}
