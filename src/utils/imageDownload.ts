import { File } from 'expo-file-system';

// 部分壁纸源会概率性返回 200 空响应体（例如 4qb.cn 偶发 0 字节），
// 下载完成后按大小校验，过小则重试，避免把空文件或半截文件当成壁纸。
const MIN_IMAGE_BYTES = 2048;
// 部分源（如 loliapi）约半数重定向指向不存在的图片，多试几次再换源。
const MAX_ATTEMPTS_PER_URL = 3;

export async function downloadImageFile(url: string, target: File): Promise<File> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_URL; attempt += 1) {
    try {
      const downloaded = await File.downloadFileAsync(url, target, { idempotent: true });
      const info = downloaded.info();
      if (info.exists && (info.size ?? 0) >= MIN_IMAGE_BYTES) return downloaded;
      lastError = new Error('下载的图片内容为空');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('图片下载失败');
}
