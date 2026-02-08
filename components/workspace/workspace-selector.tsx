'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { mockWorkspaces } from '@/lib/mock-data'
import { mockAuth } from '@/lib/mock-auth'
import { Workspace } from '@/lib/types'
import { Building2, ChevronRight } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface WorkspaceSelectorProps {
  onSelect: (workspace: Workspace) => void
}

export function WorkspaceSelector({ onSelect }: WorkspaceSelectorProps) {
  const [workspaces] = useState(mockWorkspaces)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const handleSelect = (workspace: Workspace) => {
    mockAuth.setCurrentWorkspace(workspace)
    onSelect(workspace)
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">{t('selectWorkspace')}</CardTitle>
        <CardDescription>
          {t('chooseWorkspace')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {workspaces.map((workspace) => (
            <Button
              key={workspace.id}
              variant="outline"
              className="w-full justify-between h-auto p-4"
              onClick={() => handleSelect(workspace)}
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  {workspace.logo_url ? (
                    <img 
                      src={workspace.logo_url || "/placeholder.svg"} 
                      alt={workspace.name}
                      className="h-8 w-8 rounded"
                    />
                  ) : (
                    <Building2 className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="text-left">
                  <div className="font-semibold">{workspace.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {workspace.domain}.chat
                  </div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
