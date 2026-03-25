// Acquisition domain types — bloggers, B2B leads, VC leads, ad inventory

export interface AcquisitionBlogger {
  id: string
  name: string
  platform: string
  followers: string
  email: string
  status: string
  commission: string
  cost: string
  createdAt: string
  updatedAt: string
}

export interface AcquisitionB2BLead {
  id: string
  name: string
  region: string
  contact: string
  email: string
  source: string
  status: string
  estValue: string
  createdAt: string
  updatedAt: string
}

export interface AcquisitionVCLead {
  id: string
  name: string
  region: string
  contact: string
  email: string
  source: string
  status: string
  focus: string
  createdAt: string
  updatedAt: string
}

export interface AcquisitionAd {
  id: string
  brand: string
  type: string
  duration: string
  reward: string
  status: string
  views: string
  createdAt: string
  updatedAt: string
}

export interface AcquisitionBootstrapData {
  bloggers: AcquisitionBlogger[]
  b2bLeads: AcquisitionB2BLead[]
  vcLeads: AcquisitionVCLead[]
  ads: AcquisitionAd[]
}
