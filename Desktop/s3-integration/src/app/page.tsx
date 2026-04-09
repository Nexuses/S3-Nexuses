"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

const MAX_FILES = 10;

export default function Home() {
  const { data: session, status } = useSession();
  const [buckets, setBuckets] = useState<string[]>([]);
  const [selectedBucket, setSelectedBucket] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ key: string; objectUrl: string; presignedUrl?: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [credentialsMissing, setCredentialsMissing] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [makePublic, setMakePublic] = useState(false);
  const [addCors, setAddCors] = useState(false);
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  function refreshBuckets(selectBucket?: string) {
    return fetch("/api/buckets")
      .then((res) => {
        if (res.status === 401) throw new Error("Sign in required");
        return res.json();
      })
      .then((data) => {
        if (data.error) {
          setCredentialsMissing(data.code === "CREDENTIALS_MISSING");
          throw new Error(data.error);
        }
        setCredentialsMissing(false);
        setBuckets(data.buckets ?? []);
        if (data.buckets?.length) {
          if (selectBucket && data.buckets.includes(selectBucket)) {
            setSelectedBucket(selectBucket);
          } else if (!data.buckets.includes(selectedBucket)) {
            setSelectedBucket(data.buckets[0]);
          }
        }
      });
  }

  useEffect(() => {
    if (status !== "authenticated" || isAdmin) return;
    setLoadingBuckets(true);
    refreshBuckets()
      .catch((err) => setError(err.message ?? "Failed to load buckets"))
      .finally(() => setLoadingBuckets(false));
  }, [status, isAdmin]);

  async function handleCreateBucket(e: React.FormEvent) {
    e.preventDefault();
    if (!newBucketName.trim()) return;
    setError(null);
    setCredentialsMissing(false);
    setCreateSuccess(null);
    setCreatingBucket(true);
    try {
      const res = await fetch("/api/buckets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBucketName.trim(),
          makePublic,
          addCors,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) throw new Error("Admin access required");
        setCredentialsMissing(data.code === "CREDENTIALS_MISSING");
        throw new Error(data.error ?? "Failed to create bucket");
      }
      setCreateSuccess(data.bucket);
      setNewBucketName("");
      setMakePublic(false);
      setAddCors(false);
      await refreshBuckets(data.bucket);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bucket");
    } finally {
      setCreatingBucket(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBucket || files.length === 0) return;
    if (files.length > MAX_FILES) {
      setError(`You can upload a maximum of ${MAX_FILES} files at a time.`);
      return;
    }
    setError(null);
    setCredentialsMissing(false);
    setUploadedFiles([]);
    setUploading(true);

    const formData = new FormData();
    formData.set("bucket", selectedBucket);
    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) throw new Error("Sign in required");
        setCredentialsMissing(data.code === "CREDENTIALS_MISSING");
        throw new Error(data.error ?? "Upload failed");
      }
      setUploadedFiles(data.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await signIn("credentials", {
        email: authEmail.trim(),
        password: authPassword,
        redirect: false,
      });
      if (result?.error) {
        setAuthError("Invalid email or password.");
        return;
      }
      if (result?.ok) {
        setAuthEmail("");
        setAuthPassword("");
      }
    } catch {
      setAuthError("Login failed");
    } finally {
      setAuthLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <img
          src="https://cdn-nexlink.s3.us-east-2.amazonaws.com/Nexuses-full-logo-dark_8d412ea3-bf11-4fc6-af9c-bee7e51ef494.png"
          alt="Nexuses"
          className="h-10 w-auto object-contain"
        />
        <p className="text-zinc-700 font-medium">Loading…</p>
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
        <img
          src="https://cdn-nexlink.s3.us-east-2.amazonaws.com/Nexuses-full-logo-dark_8d412ea3-bf11-4fc6-af9c-bee7e51ef494.png"
          alt="Nexuses"
          className="h-10 w-auto object-contain"
        />
        <main className="w-full max-w-md rounded-3xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/98 dark:bg-zinc-900/98 shadow-2xl shadow-zinc-900/5 dark:shadow-black/20 backdrop-blur-md p-8 sm:p-10">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">
            S3 Upload
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
            Sign in to continue.
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={authEmail ?? ""}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                className="w-full h-12 px-4 rounded-xl border border-zinc-200 dark:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={authPassword ?? ""}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                className="w-full h-12 px-4 rounded-xl border border-zinc-200 dark:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 focus:border-transparent transition-shadow"
              />
            </div>
            {authError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-3 border border-red-100 dark:border-red-800/30">
                {authError}
              </div>
            )}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full h-12 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-lg shadow-zinc-900/10 disabled:opacity-50 transition-all duration-200"
            >
              {authLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <img
        src="https://cdn-nexlink.s3.us-east-2.amazonaws.com/Nexuses-full-logo-dark_8d412ea3-bf11-4fc6-af9c-bee7e51ef494.png"
        alt="Nexuses"
        className="h-10 w-auto object-contain"
      />
      <main className="w-full max-w-lg rounded-3xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/98 dark:bg-zinc-900/98 shadow-2xl shadow-zinc-900/5 dark:shadow-black/20 backdrop-blur-md p-8 sm:p-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              S3 Upload
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {session.user?.email} · {isAdmin ? "Admin" : "User"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </div>

        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
          {isAdmin
            ? "Create new buckets below. Only users can upload files."
            : "Select a bucket, choose one or more files, and get object URLs."}
        </p>

        {isAdmin && (
          <div className="mb-6 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-800/40 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Add new bucket
            </h2>
            <form onSubmit={handleCreateBucket} className="space-y-4">
              <div>
                <label htmlFor="new-bucket" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Bucket name
                </label>
                <input
                  id="new-bucket"
                  type="text"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  placeholder="my-unique-bucket-name"
                  className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 focus:border-transparent transition-shadow"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
                  3–63 chars, lowercase letters, numbers, hyphens only
                </p>
              </div>
              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={makePublic}
                    onChange={(e) => setMakePublic(e.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-400 size-4"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Make bucket public</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addCors}
                    onChange={(e) => setAddCors(e.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-400 size-4"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Add CORS</span>
                </label>
              </div>
              <button
                type="submit"
                disabled={creatingBucket || !newBucketName.trim() || loadingBuckets}
                className="h-11 px-5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-lg shadow-zinc-900/10 disabled:opacity-50 transition-all duration-200"
              >
                {creatingBucket ? "Creating…" : "Create bucket"}
              </button>
              {createSuccess && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  Bucket “{createSuccess}” created and selected.
                </p>
              )}
            </form>
          </div>
        )}

        {!isAdmin && (
          <>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="bucket" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Bucket
                </label>
                <select
                  id="bucket"
                  value={selectedBucket}
                  onChange={(e) => setSelectedBucket(e.target.value)}
                  disabled={loadingBuckets}
                  className="select-modern w-full h-12 px-4 rounded-xl border border-zinc-200 dark:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 focus:border-transparent disabled:opacity-50 transition-shadow cursor-pointer"
                >
                  {loadingBuckets ? (
                    <option value="">Loading buckets…</option>
                  ) : buckets.length === 0 ? (
                    <option value="">No buckets found</option>
                  ) : (
                    buckets.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="file" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Files
                </label>
                <input
                  id="file"
                  type="file"
                  multiple
                  onChange={(e) => {
                    const selectedFiles = Array.from(e.target.files ?? []);
                    if (selectedFiles.length > MAX_FILES) {
                      setError(`You can select up to ${MAX_FILES} files only.`);
                      setFiles([]);
                      return;
                    }
                    setError(null);
                    setFiles(selectedFiles);
                  }}
                  className="w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-4 file:py-3 file:px-5 file:rounded-xl file:border-0 file:bg-zinc-200 dark:file:bg-zinc-600 file:text-zinc-800 dark:file:text-zinc-200 file:font-medium file:shadow-sm hover:file:bg-zinc-300 dark:hover:file:bg-zinc-500 file:transition-colors cursor-pointer"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
                  Maximum {MAX_FILES} files per upload.
                </p>
              </div>
              {error && (
                <div
                  className={
                    credentialsMissing
                      ? "rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm px-4 py-3 border border-amber-100 dark:border-amber-800/30 space-y-1"
                      : "rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-3 border border-red-100 dark:border-red-800/30"
                  }
                >
                  {credentialsMissing ? (
                    <>
                      <p className="font-medium">Setup required</p>
                      <p className="opacity-90">
                        Add AWS credentials to <code className="bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">.env.local</code> (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION) and restart the server.
                      </p>
                    </>
                  ) : (
                    error
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={uploading || !selectedBucket || files.length === 0 || loadingBuckets}
                className="w-full h-12 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-lg shadow-zinc-900/10 disabled:opacity-50 transition-all duration-200"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </form>

            {uploadedFiles.length > 0 && (
              <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Object URLs</h2>
                <div className="space-y-2">
                  {uploadedFiles.map((uploadedFile) => (
                    <div
                      key={uploadedFile.key}
                      className="rounded-xl bg-zinc-100/80 dark:bg-zinc-800/80 p-4 break-all border border-zinc-200/50 dark:border-zinc-700/50"
                    >
                      <a
                        href={uploadedFile.objectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-800 dark:text-zinc-200 hover:text-zinc-600 dark:hover:text-zinc-400 underline underline-offset-2 text-sm font-medium transition-colors"
                      >
                        {uploadedFile.objectUrl}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
