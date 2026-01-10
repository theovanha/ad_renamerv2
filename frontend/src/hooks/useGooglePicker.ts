import { useCallback, useEffect, useState } from 'react';

declare global {
  interface Window {
    google: {
      picker: {
        PickerBuilder: new () => PickerBuilder;
        ViewId: {
          FOLDERS: string;
          DOCS: string;
          RECENTLY_PICKED: string;
        };
        Feature: {
          NAV_HIDDEN: string;
          MULTISELECT_ENABLED: string;
          SUPPORT_DRIVES: string;
        };
        DocsViewMode: {
          LIST: string;
          GRID: string;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        DocsView: new (viewId: string) => DocsView;
      };
    };
    gapi: {
      load: (api: string, callback: () => void) => void;
      client: {
        init: (config: { apiKey: string; discoveryDocs: string[] }) => Promise<void>;
        getToken: () => { access_token: string } | null;
        setToken: (token: { access_token: string }) => void;
      };
    };
  }
}

interface PickerBuilder {
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  addView(view: DocsView): PickerBuilder;
  setCallback(callback: (data: PickerCallbackData) => void): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setSize(width: number, height: number): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface DocsView {
  setSelectFolderEnabled(enabled: boolean): DocsView;
  setIncludeFolders(include: boolean): DocsView;
  setMimeTypes(mimeTypes: string): DocsView;
  setParent(parentId: string): DocsView;
  setEnableDrives(enable: boolean): DocsView;
  setLabel(label: string): DocsView;
  setMode(mode: string): DocsView;
}

interface PickerCallbackData {
  action: string;
  docs?: Array<{
    id: string;
    name: string;
    mimeType: string;
    url: string;
  }>;
}

interface UseGooglePickerOptions {
  apiKey: string;
  clientId: string;
  onFolderSelected: (folderId: string, folderName: string) => void;
}

export function useGooglePicker({ apiKey, clientId, onFolderSelected }: UseGooglePickerOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Load the Google Picker API
  useEffect(() => {
    if (!apiKey || !clientId) return;

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = reject;
        document.body.appendChild(script);
      });
    };

    const loadApis = async () => {
      try {
        console.log('[Picker] Loading Google API script...');
        // Load Google API client
        await loadScript('https://apis.google.com/js/api.js');
        console.log('[Picker] Script loaded, loading gapi.client:picker...');
        
        // Load gapi.client and picker
        await new Promise<void>((resolve, reject) => {
          window.gapi.load('client:picker', {
            callback: resolve,
            onerror: () => reject(new Error('Failed to load gapi.client:picker')),
          });
        });
        console.log('[Picker] gapi.client:picker loaded, initializing...');

        // Initialize client (skip discovery docs - not needed for picker)
        await window.gapi.client.init({
          apiKey,
          discoveryDocs: [],
        });
        console.log('[Picker] Initialized successfully!');

        setIsReady(true);
      } catch (error) {
        console.error('[Picker] Failed to load Google Picker API:', error);
        // Still try to set ready if picker loaded but init failed
        if (window.google?.picker) {
          console.log('[Picker] Picker available despite init error, setting ready');
          setIsReady(true);
        }
      }
    };

    loadApis();
  }, [apiKey, clientId]);

  const openPicker = useCallback(async () => {
    if (!isReady || !apiKey) {
      console.error('Google Picker not ready');
      return;
    }

    setIsLoading(true);

    try {
      // Get access token from our backend
      const tokenResponse = await fetch('/api/auth/tokens', {
        credentials: 'include',
      });
      
      if (!tokenResponse.ok) {
        throw new Error('Not authenticated. Please sign in first.');
      }

      const tokens = await tokenResponse.json();
      const accessToken = tokens.access_token;

      // Create Recent Folders view
      const recentView = new window.google.picker.DocsView(window.google.picker.ViewId.RECENTLY_PICKED)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes('application/vnd.google-apps.folder')
        .setMode(window.google.picker.DocsViewMode.LIST)
        .setLabel('Recent Folders');

      // Create My Drive view - starts at root with navigation
      const myDriveView = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setParent('root')
        .setMode(window.google.picker.DocsViewMode.LIST)
        .setLabel('My Drive');

      // Create Shared Drives view
      const sharedDrivesView = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setEnableDrives(true)
        .setMode(window.google.picker.DocsViewMode.LIST)
        .setLabel('Shared Drives');

      // Build picker with multiple views and navigation enabled
      // Shared Drives first as default view
      const picker = new window.google.picker.PickerBuilder()
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setTitle('Select a folder')
        .addView(sharedDrivesView)
        .addView(myDriveView)
        .addView(recentView)
        .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
        .setSize(1000, 800)
        .setCallback((data: PickerCallbackData) => {
          if (data.action === window.google.picker.Action.PICKED && data.docs?.[0]) {
            const folder = data.docs[0];
            onFolderSelected(folder.id, folder.name);
          }
          setIsLoading(false);
        })
        .build();

      picker.setVisible(true);
    } catch (error) {
      console.error('Failed to open picker:', error);
      setIsLoading(false);
      throw error;
    }
  }, [isReady, apiKey, onFolderSelected]);

  return {
    openPicker,
    isLoading,
    isReady,
  };
}
