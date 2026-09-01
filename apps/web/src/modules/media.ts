import { AppError, ERROR_CODES } from '@iamfriendof/shared';
import { MediaService } from '@iamfriendof/media';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/**
 * HTTP adapter for the Media module. Phase 0 accepts a JSON body with base64
 * bytes plus the decoded width/height (the client decodes dimensions). A real
 * deployment can swap in multipart parsing behind the same service call.
 */
export const mediaModule: AppModule = {
  name: 'media',
  register(router: Router, deps: ModuleDeps): void {
    const service = new MediaService(deps.db, deps.bus);

    router.post('/media/profile-picture', async (req, ctx) => {
      const body = (await safeJson(req)) as {
        mime?: unknown;
        dataBase64?: unknown;
        altText?: unknown;
        width?: unknown;
        height?: unknown;
      };
      const bytes = decodeBase64(typeof body?.dataBase64 === 'string' ? body.dataBase64 : '');
      const result = await service.uploadProfilePicture({
        memberId: ctx.memberId!,
        mime: typeof body?.mime === 'string' ? body.mime : '',
        byteSize: bytes.length,
        bytes,
        altText: typeof body?.altText === 'string' ? body.altText : '',
        width: Number(body?.width ?? 0),
        height: Number(body?.height ?? 0),
      });
      return json(result, 200, ctx.correlationId);
    }, { auth: true });

    router.delete('/media/profile-picture', async (_req, ctx) => {
      const result = await service.removeProfilePicture(ctx.memberId!);
      return json(result, 200, ctx.correlationId);
    }, { auth: true });
  },
};

function decodeBase64(b64: string): Uint8Array {
  try {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid image data', 422);
  }
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
