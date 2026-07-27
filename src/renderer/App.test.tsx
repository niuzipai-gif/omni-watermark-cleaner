import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import type { OmniApi } from '../types/omniApi';

function installMockApi(overrides: Partial<OmniApi> = {}) {
  const api: OmniApi = {
    getSettings: vi.fn().mockResolvedValue({
      outputDirectory: 'D:\\exports',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 900000,
      allowLowConfidence: false
    }),
    saveSettings: vi.fn(async (settings) => settings),
    selectOutputDirectory: vi.fn().mockResolvedValue('E:\\cleaned'),
    getPathForFile: vi.fn((file) => (file as File & { path?: string }).path ?? file.name),
    enqueueVideos: vi.fn().mockResolvedValue([]),
    openPath: vi.fn().mockResolvedValue(undefined),
    onTaskUpdated: vi.fn(() => () => undefined),
    ...overrides
  };

  window.omni = api;
  return api;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('loads and updates the configured output directory', async () => {
    const api = installMockApi();
    render(<App />);

    expect(await screen.findByText('D:\\exports')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /更换导出文件夹/ }));

    expect(await screen.findByText('E:\\cleaned')).toBeInTheDocument();
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        outputDirectory: 'E:\\cleaned'
      })
    );
  });

  it('rejects dropped non-video files before enqueueing', async () => {
    const api = installMockApi();
    render(<App />);
    await screen.findByText('D:\\exports');

    const file = new File(['x'], 'frame.png', { type: 'image/png' });
    Object.defineProperty(file, 'path', { value: 'F:\\in\\frame.png' });

    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => expect(screen.getByText(/不支持的文件/)).toBeInTheDocument());
    expect(api.enqueueVideos).not.toHaveBeenCalled();
  });

  it('uses Electron native file paths for dropped videos when File.path is unavailable', async () => {
    const api = installMockApi({
      getPathForFile: vi.fn(() => 'E:\\视频素材\\Product_detail_video_showcase_202606221501.mp4')
    });
    render(<App />);
    await screen.findByText('D:\\exports');

    const file = new File(['x'], 'Product_detail_video_showcase_202606221501.mp4', { type: 'video/mp4' });

    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() =>
      expect(api.enqueueVideos).toHaveBeenCalledWith(['E:\\视频素材\\Product_detail_video_showcase_202606221501.mp4'])
    );
  });
});
