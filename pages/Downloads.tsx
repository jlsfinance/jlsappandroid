import React, { useEffect, useState } from 'react';
import { Filesystem, Directory, FileInfo } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const Downloads: React.FC = () => {
    const [files, setFiles] = useState<FileInfo[]>([]);
    const [loading, setLoading] = useState(true);

    const loadFiles = async () => {
        try {
            setLoading(true);
            // 1. Try reading from App Folder (External)
            try {
                const externalRes = await Filesystem.readdir({
                    path: 'JLS_Downloads',
                    directory: Directory.External
                });
                setFiles(externalRes.files);
            } catch (extErr) {
                console.log('No external files or error:', extErr);
                setFiles([]);
            }
        } catch (error) {
            console.error('Error loading files:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFiles();
    }, []);

    const openFile = async (file: FileInfo) => {
        try {
            // Share is the best way to "Open" generally without extra plugins
            await Share.share({
                title: file.name,
                url: file.uri,
                dialogTitle: 'Open with...'
            });
        } catch (error) {
            console.error('Error opening file:', error);
        }
    };

    const deleteFile = async (file: FileInfo) => {
        if (!confirm(`Delete ${file.name}?`)) return;
        try {
            await Filesystem.deleteFile({
                path: `JLS_Downloads/${file.name}`,
                directory: Directory.External
            });
            loadFiles(); // Refresh
        } catch (error) {
            console.error('Delete failed:', error);
            alert('Could not delete file.');
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6 text-slate-800 dark:text-white">Downloads</h1>

            {loading ? (
                <div className="text-center p-10 text-slate-500">Loading files...</div>
            ) : files.length === 0 ? (
                <div className="text-center p-10 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">folder_open</span>
                    <p className="text-slate-500">No downloads found in App Folder.</p>
                </div>
            ) : (
                <div className="grid gap-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 bg-red-100/50 dark:bg-red-900/20 text-red-600 rounded-lg flex items-center justify-center">
                                    <span className="material-symbols-outlined">picture_as_pdf</span>
                                </div>
                                <div>
                                    <h3 className="font-medium text-slate-800 dark:text-slate-200">{file.name}</h3>
                                    {file.size && <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => openFile(file)}
                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Open / Share"
                                >
                                    <span className="material-symbols-outlined">ios_share</span>
                                </button>
                                <button
                                    onClick={() => deleteFile(file)}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete"
                                >
                                    <span className="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Downloads;
