"""API form of the user's Tiled Fusion Upscale video path (8 distilled steps)."""
DEFAULT_PROMPT = 'Natural fine texture, restrained edge definition, subtle film grain, balanced contrast, neutral color rendering.'
SIGMAS = '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0'

def build_workflow(video, sizes, prompt=DEFAULT_PROMPT, seed=42, prefix='video/Kendo_LTX_v4'):
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 2000:
        raise ValueError('คำอธิบายรายละเอียดต้องมีความยาว 1–2000 ตัวอักษร')
    if not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed <= 4294967295:
        raise ValueError('Seed ไม่ถูกต้อง')
    n = lambda kind, **inputs: dict(class_type=kind, inputs=inputs)
    graph = {
        'source': n('KendoLTXLoadVideo', video=video, **sizes),
        'model': n('UNETLoader', unet_name='ltx-2.5-22b-distilled-transformer-bf16.safetensors', weight_dtype='default'),
        'refine': n('LTXICLoRALoaderModelOnly', model=['model', 0], lora_name='ltx-2.5-22b-ic-lora-refine-details-1.0.safetensors', strength_model=1.0),
        'clip': n('CLIPLoader', clip_name='gemma4-12b-with-proj-ltx-2.5-bf16.safetensors', type='ltxv', device='default'),
        'vae': n('VAELoader', vae_name='ltx-2.5-video-vae-bf16.safetensors'),
        'positive': n('CLIPTextEncode', clip=['clip', 0], text=prompt.strip()),
        'negative': n('CLIPTextEncode', clip=['clip', 0], text=''),
        'conditioning': n('LTXVConditioning', positive=['positive', 0], negative=['negative', 0], frame_rate=['source', 2]),
        'empty': n('EmptyLTXVLatentVideo', width=sizes['canvas_width'], height=sizes['canvas_height'], length=['source', 1], batch_size=1),
        'guide': n('LTXAddVideoICLoRAGuide', positive=['conditioning', 0], negative=['conditioning', 1], vae=['vae', 0],
                   latent=['empty', 0], image=['source', 0], frame_idx=0, strength=1.0, latent_downscale_factor=1.0,
                   crop='disabled', use_tiled_encode=False, tile_size=256, tile_overlap=64, use_streaming=True, tile_frames=97),
        'sigmas': n('ManualSigmas', sigmas=SIGMAS),
        'sampler': n('KSamplerSelect', sampler_name='euler'),
        'fusion': n('LTXVTiledFusionSampler', model=['refine', 0], positive=['guide', 0], negative=['guide', 1],
                    latents=['guide', 2], sigmas=['sigmas', 0], sampler=['sampler', 0], seed=seed, cfg=1.0,
                    tile_width=1024, tile_height=576, overlap_frac=0.5, blend_var=0.05, grid_cycle=1,
                    tile_frames=97, vae=['vae', 0], canvas_device='auto'),
        'decode': n('VAEDecodeTiled', samples=['fusion', 0], vae=['vae', 0], tile_size=512, overlap=64, temporal_size=128, temporal_overlap=32),
        'save': n('KendoLTXSaveVideo', images=['decode', 0], video=video, fps=['source', 2], original_frames=['source', 3],
                  target_width=sizes['target_width'], target_height=sizes['target_height'], filename_prefix=prefix),
    }
    return graph
