export default function EmailConfirmedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md rounded-xl border bg-background px-8 py-6 shadow-lg">
        <h1 className="text-2xl font-semibold mb-2 text-center">
          Email confirmed
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-4">
          Your email has been successfully verified.
        </p>
        <p className="text-sm text-muted-foreground text-center">
          You can now close this tab and go back to the registration page.
          After that, click the register button again to continue to your workspace.
        </p>
      </div>
    </main>
  )
}


