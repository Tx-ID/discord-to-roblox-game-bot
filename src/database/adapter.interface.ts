export interface DatabaseAdapter {
    connect(): Promise<void>;
    // Add generic methods as needed, e.g.,
    // saveUser(user: any): Promise<void>;
    // getUser(id: string): Promise<any>;
}
