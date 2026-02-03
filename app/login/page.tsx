import LoginPageClient from './login-page-client'

type SearchParams = { [key: string]: string | string[] | undefined }

type LoginPageServerProps = {
  searchParams?: SearchParams | Promise<SearchParams>
}

export default async function LoginPage({ searchParams }: LoginPageServerProps = {}) {
  const resolvedParams =
    typeof searchParams === 'object' && typeof (searchParams as Promise<SearchParams>)?.then === 'function'
      ? await searchParams
      : (searchParams as SearchParams) || {}

  const oauthParam = Array.isArray(resolvedParams?.oauth)
    ? resolvedParams?.oauth?.[0]
    : resolvedParams?.oauth
  const initialStep = oauthParam === 'success' ? 'workspace' : 'login'
  return <LoginPageClient initialStep={initialStep} />
}
